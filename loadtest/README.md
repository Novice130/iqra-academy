# Load testing (Locust)

Method and rules: `infra/gmktec/loadtest/LOCUST_GUIDE.md`. The rules that do
not bend: staging only, one site at a time, Stripe sandbox only, every account
ends in `@loadtest.invalid`. `locustfile.py` refuses any host that is not
`https://staging.*`.

Novice Tutor has no staging yet. Until `staging.novicetutor.com` exists (same
image, its own Neon branch, its own LiveKit project, push and email keys left
empty), the only permitted target is a throwaway local stack. Do not point this
at `novicetutor.com` or `hz-novicetutor.learnnovice.com`: both use the
production database and the production LiveKit project, and starting a class
rings real students.

## Journeys

| Class | Weight | What it does |
|---|---|---|
| `Visitor` | 3 | Signed out: home, login, register, join and download pages |
| `Student` | 5 | Signs in, opens the dashboard, then polls as the dashboard does: incoming call every 2.5 s, live class every 15 s, notifications every 20 s. With `LOADTEST_WS=1` also holds the realtime WebSocket open |
| `Teacher` | 1 | Signs in, starts an instant class, joins it, polls the waiting guests every 10 s and admits them, ends the class after `LOADTEST_CLASS_SECONDS` |
| `Guest` | 2 | No account: knocks on an open class and polls every 4 s until admitted |

Not covered yet: a signed-in student joining a class they are booked into,
booking, payments (Stripe), chat, and the admin pages.

## Accounts

Sign-up makes a student; teachers cannot register themselves. Create the
accounts on the target's database first:

```sh
cd apps/web
DATABASE_URL=<staging branch or local> ALLOW_LOCAL_DB_SCRIPTS=1 \
LOCAL_TEST_DB_HOSTS=<staging branch host, if not localhost> \
LOADTEST_PASSWORD=... LOADTEST_TEACHERS=5 LOADTEST_STUDENTS=20 \
  npx tsx scripts/create-loadtest-accounts.ts
```

The script refuses the shared Neon endpoints. One simulated user per account:
users beyond `LOADTEST_TEACHERS` / `LOADTEST_STUDENTS` stop at once.

## Running

On `vm-loadtest`, against staging:

```sh
cd /opt/loadtest/novicetutor
set -a; . /opt/loadtest/.env; set +a      # CF_ACCESS_CLIENT_ID / _SECRET
export LOADTEST_PASSWORD=... LOADTEST_TEACHERS=5 LOADTEST_STUDENTS=20 LOADTEST_WS=1
/opt/loadtest/venv/bin/locust -f loadtest/locustfile.py --host https://staging.novicetutor.com \
  --headless -u 10 -r 1 -t 5m --csv results/baseline --html results/baseline.html
```

Against a throwaway local stack (no proxy, so the socket has its own address):

```sh
LOADTEST_ALLOW_LOCAL=1 LOADTEST_WS=1 LOADTEST_WS_BASE=ws://127.0.0.1:8787 LOADTEST_PASSWORD=... \
  locust -f loadtest/locustfile.py --host http://127.0.0.1:3000 --headless -u 22 -r 2 -t 5m
```

A local stack must be built with `NEXT_PUBLIC_APP_URL` set to its own http
address (session cookies are `Secure` otherwise and are never sent back), and
with `LIVEKIT_URL` pointing at nothing real.

## Sign-in limit

Sign-in is limited to 10 per IP address, and the count resets only after 60
seconds with no sign-in at all. Every Locust user shares one address, so the
locustfile signs in 9 users, waits 61 seconds, and repeats: 100 accounts take
about 12 minutes to sign in. Start the clock on a run after that.
