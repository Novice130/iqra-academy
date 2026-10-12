"""Locust journeys for Novice Tutor (apps/web).

Read loadtest/README.md first. Staging only: the guard below refuses any other
host. Accounts are created beforehand by
apps/web/scripts/create-loadtest-accounts.ts and are addressed by index.

Environment:
  CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET  Cloudflare Access service token (staging)
  LOADTEST_PASSWORD      password shared by every load-test account
  LOADTEST_TEACHERS      how many lt-teacher-NNN accounts exist (default 5)
  LOADTEST_STUDENTS      how many lt-student-NNN accounts exist (default 20)
  LOADTEST_CLASS_SECONDS how long a class stays open (default 60)
  LOADTEST_WS=1          students also hold the realtime WebSocket open
  LOADTEST_WS_BASE       where the socket is, when not the site itself (a local
                         stack has no proxy: ws://127.0.0.1:8787)
  LOADTEST_ALLOW_LOCAL=1 allow http://localhost or 127.0.0.1 (a throwaway local stack)
"""

import itertools
import json
import os
import random
import time
from urllib.parse import urlparse

import gevent
from faker import Faker
from gevent.lock import Semaphore
from locust import HttpUser, between, constant, events, task
from locust.exception import StopUser

fake = Faker("en_US")

PASSWORD = os.environ.get("LOADTEST_PASSWORD", "")
N_TEACHERS = int(os.environ.get("LOADTEST_TEACHERS", "5"))
N_STUDENTS = int(os.environ.get("LOADTEST_STUDENTS", "20"))
CLASS_SECONDS = int(os.environ.get("LOADTEST_CLASS_SECONDS", "60"))
USE_WS = os.environ.get("LOADTEST_WS") == "1"
ALLOW_LOCAL = os.environ.get("LOADTEST_ALLOW_LOCAL") == "1"

# Intervals read from the components at commit d62ffff. Re-check before a run.
INCOMING_CALL_POLL = 2.5  # dashboard/IncomingCallOverlay.tsx
LIVE_CLASS_POLL = 15  # dashboard/LiveClassRibbon.tsx (fallback, no socket)
NOTIFICATIONS_POLL = 20  # dashboard/MeetingNotificationBanner.tsx
GUEST_LIST_POLL = 10  # components/video/GuestKnockPrompt.tsx
GUEST_STATUS_POLL = 4  # app/join/[id]/page.tsx

# Sign-in is limited to 10 per IP address, and every Locust user comes from one
# address. The count only resets after 60 seconds with no sign-in at all (it is
# not a sliding window), so sign-ins go in batches of 9 with a quiet minute
# between batches. This stays under the limit instead of working round it.
SIGN_IN_GAP = 2.0
SIGN_IN_BATCH = 9
SIGN_IN_QUIET = 61.0
_sign_in_lock = Semaphore()
_last_sign_in = [0.0]
_sign_in_count = [0]

_teacher_ids = itertools.count()
_student_ids = itertools.count()

# Classes that are open right now, for guests to knock on.
live_sessions = []


@events.init.add_listener
def staging_only(environment, **_):
    """Refuse to start unless the target is an https staging host."""
    url = urlparse(environment.host or "")
    host = url.hostname or ""
    if url.scheme == "https" and host.startswith("staging."):
        return
    if ALLOW_LOCAL and host in ("localhost", "127.0.0.1"):
        return
    raise SystemExit(f"guard: refusing to run against {environment.host!r}")


def base_headers(host):
    headers = {"User-Agent": "locust-staging-loadtest", "Origin": host.rstrip("/")}
    if os.environ.get("CF_ACCESS_CLIENT_ID"):
        headers["CF-Access-Client-Id"] = os.environ["CF_ACCESS_CLIENT_ID"]
        headers["CF-Access-Client-Secret"] = os.environ["CF_ACCESS_CLIENT_SECRET"]
    return headers


def ok_json(response, *keys):
    """Mark the response failed unless it is 200 JSON holding every key."""
    if response.status_code != 200:
        response.failure(f"{response.status_code}: {response.text[:120]}")
        return None
    try:
        body = response.json()
    except ValueError:
        response.failure(f"not JSON: {response.text[:120]}")
        return None
    missing = [k for k in keys if k not in body]
    if missing:
        response.failure(f"missing {missing}: {response.text[:120]}")
        return None
    return body


class SiteUser(HttpUser):
    abstract = True

    def on_start(self):
        self.client.headers.update(base_headers(self.host))

    def sign_in(self, email):
        if not PASSWORD:
            raise SystemExit("LOADTEST_PASSWORD is not set")
        with _sign_in_lock:
            quiet = _sign_in_count[0] > 0 and _sign_in_count[0] % SIGN_IN_BATCH == 0
            wait = (SIGN_IN_QUIET if quiet else SIGN_IN_GAP) - (time.time() - _last_sign_in[0])
            if wait > 0:
                gevent.sleep(wait)
            _sign_in_count[0] += 1
            with self.client.post(
                "/api/auth/sign-in/email",
                json={"email": email, "password": PASSWORD},
                name="sign in",
                catch_response=True,
            ) as r:
                _last_sign_in[0] = time.time()
                if r.status_code != 200:
                    r.failure(f"sign in {email} {r.status_code}: {r.text[:120]}")
                    raise StopUser()
        with self.client.get("/api/me", name="me", catch_response=True) as r:
            body = ok_json(r, "user")
            if body is None:
                raise StopUser()
            self.me = body["user"]


class Visitor(SiteUser):
    """Someone reading the public pages, signed out."""

    weight = 3
    wait_time = between(2, 6)

    @task(4)
    def home(self):
        self.client.get("/", name="home")

    @task(2)
    def login_page(self):
        self.client.get("/login", name="login page")

    @task(1)
    def register_page(self):
        self.client.get("/register", name="register page")

    @task(1)
    def join_page(self):
        self.client.get("/join", name="join page")

    @task(1)
    def download_page(self):
        self.client.get("/app/download", name="download page")


class Student(SiteUser):
    """A student with the dashboard open: this is most of the real traffic."""

    weight = 5
    wait_time = constant(INCOMING_CALL_POLL)

    def on_start(self):
        super().on_start()
        n = next(_student_ids)
        if n >= N_STUDENTS:
            raise StopUser()  # one account per simulated student
        self.sign_in(f"lt-student-{n + 1:03d}@loadtest.invalid")
        self.client.get("/dashboard", name="dashboard page")
        self.next_live = 0.0
        self.next_notifications = 0.0
        self.ws = None
        if USE_WS:
            self.open_socket()

    def on_stop(self):
        if self.ws is not None:
            self.ws.close()

    def open_socket(self):
        import websocket  # websocket-client

        with self.client.post("/api/realtime/ticket", name="realtime ticket", catch_response=True) as r:
            body = ok_json(r, "ticket")
            if body is None:
                return
        ws_base = os.environ.get("LOADTEST_WS_BASE") or self.host.replace("http", "ws", 1)
        url = ws_base.rstrip("/") + "/api/realtime/ws?ticket=" + body["ticket"]
        headers = [f"{k}: {v}" for k, v in base_headers(self.host).items() if k != "Origin"]
        started = time.time()
        error = None
        try:
            self.ws = websocket.create_connection(url, header=headers, origin=self.host, timeout=15)
            first = json.loads(self.ws.recv())
            if first.get("type") != "ready":
                error = Exception(f"expected ready, got {first}")
            else:
                self.ws.send(json.dumps({"type": "subscribe", "teacherId": None}))
                self.ws.send(json.dumps({"type": "presence", "foreground": True}))
                self.ws.settimeout(0.01)
        except Exception as exc:  # reported to Locust below
            error = exc
            self.ws = None
        self.environment.events.request.fire(
            request_type="WS",
            name="realtime connect + ready",
            response_time=(time.time() - started) * 1000,
            response_length=0,
            exception=error,
        )
        self.next_heartbeat = time.time() + 30

    @task
    def dashboard_tick(self):
        now = time.time()
        with self.client.get("/api/calls/incoming", name="poll incoming call", catch_response=True) as r:
            ok_json(r, "call")
        if now >= self.next_live:
            self.next_live = now + LIVE_CLASS_POLL
            with self.client.get("/api/students/live-class", name="poll live class", catch_response=True) as r:
                ok_json(r)
        if now >= self.next_notifications:
            self.next_notifications = now + NOTIFICATIONS_POLL
            with self.client.get("/api/notifications/unread", name="poll notifications", catch_response=True) as r:
                ok_json(r, "notifications")
        if self.ws is not None:
            self.socket_tick(now)

    def socket_tick(self, now):
        import websocket

        error = None
        try:
            # Reading is what answers the server's pings; a socket that is
            # never read is dropped as dead after about 30 seconds.
            while True:
                try:
                    self.ws.recv()
                except websocket.WebSocketTimeoutException:
                    break
            if now >= self.next_heartbeat:
                self.next_heartbeat = now + 30
                self.ws.send(json.dumps({"type": "heartbeat"}))
                self.environment.events.request.fire(
                    request_type="WS", name="realtime heartbeat", response_time=0, response_length=0, exception=None
                )
        except Exception as exc:
            error = exc
        if error is not None:
            self.environment.events.request.fire(
                request_type="WS", name="realtime socket lost", response_time=0, response_length=0, exception=error
            )
            self.ws = None


class Teacher(SiteUser):
    """Starts a class, admits whoever knocks, ends it."""

    weight = 1
    wait_time = between(5, 15)

    def on_start(self):
        super().on_start()
        n = next(_teacher_ids)
        if n >= N_TEACHERS:
            raise StopUser()  # one class at a time per teacher account
        self.sign_in(f"lt-teacher-{n + 1:03d}@loadtest.invalid")
        self.client.get("/dashboard/teacher", name="teacher dashboard page")

    @task
    def run_class(self):
        with self.client.post(
            "/api/teachers/instant-meeting",
            json={"studentProfileIds": []},
            name="start class",
            catch_response=True,
        ) as r:
            body = ok_json(r, "success", "sessionId", "token")
            if body is None:
                return
        session_id = body["sessionId"]

        with self.client.get(
            f"/api/sessions/{session_id}/join", name="join class (teacher)", catch_response=True
        ) as r:
            ok_json(r, "token", "identity")

        live_sessions.append(session_id)
        try:
            ends_at = time.time() + CLASS_SECONDS
            while time.time() < ends_at:
                with self.client.get(
                    f"/api/sessions/{session_id}/guests", name="poll waiting guests", catch_response=True
                ) as r:
                    waiting = (ok_json(r, "guests") or {}).get("guests", [])
                for guest in waiting:
                    with self.client.post(
                        f"/api/sessions/{session_id}/guests",
                        json={"requestId": guest["id"], "action": "admit"},
                        name="admit guest",
                        catch_response=True,
                    ) as r:
                        ok_json(r, "success")
                gevent.sleep(GUEST_LIST_POLL)
        finally:
            live_sessions.remove(session_id)

        with self.client.post(f"/api/sessions/{session_id}/end", name="end class", catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"end {r.status_code}: {r.text[:120]}")


class Guest(SiteUser):
    """No account: knocks on an open class and waits to be let in."""

    weight = 2
    wait_time = between(5, 20)

    @task
    def knock(self):
        if not live_sessions:
            return
        session_id = random.choice(live_sessions)
        with self.client.post(
            "/api/guest/join",
            json={"sessionId": session_id, "name": fake.name()},
            name="guest knock",
            catch_response=True,
        ) as r:
            # At most 12 guests wait on one class; a full lobby is the limit
            # working, not a fault.
            if r.status_code in (409, 429):
                r.success()
                return
            body = ok_json(r, "status")
            if body is None or "requestId" not in body:
                return
        request_id = body["requestId"]

        started = time.time()
        status = body["status"]
        while status == "PENDING" and time.time() - started < 90:
            gevent.sleep(GUEST_STATUS_POLL)
            with self.client.get(
                f"/api/guest/join?requestId={request_id}", name="guest poll", catch_response=True
            ) as r:
                status = (ok_json(r, "status") or {}).get("status", "ERROR")
        # The class ending while a guest waits is a normal outcome: the knock
        # then stays PENDING until it expires.
        if status == "PENDING" and session_id not in live_sessions:
            status = "EXPIRED"
        self.environment.events.request.fire(
            request_type="FLOW",
            name="guest knock to admitted",
            response_time=(time.time() - started) * 1000,
            response_length=0,
            exception=None if status in ("ADMITTED", "EXPIRED", "DENIED") else Exception(f"guest ended as {status}"),
        )
