import { test, expect } from "playwright/test";
import WebSocket from "ws";
import { startRealtimeServer, type RealtimeServer } from "../../src/realtime/server/server";
import { createRealtimeTicket } from "../../src/lib/realtime/ticket";
import type { RealtimeClaims, SchedulingEventMessage } from "../../src/realtime/protocol";

/**
 * The realtime sidecar over real sockets: an in-process server on a random
 * port, `ws` clients, and nothing mocked. realtime.spec.ts covers the hub's
 * rules against a fake transport; this covers the transport.
 *
 * Needs neither the dev server nor a database.
 */

const SECRET = "test-sidecar-secret-with-minimum-32-characters";

let server: RealtimeServer;
let base: string;
const open: WebSocket[] = [];

test.beforeAll(async () => {
  server = await startRealtimeServer({ secret: SECRET, port: 0, host: "127.0.0.1", drainIntervalMs: 0 });
  base = `127.0.0.1:${server.port}`;
});

test.afterEach(() => {
  for (const socket of open.splice(0)) socket.terminate();
});

test.afterAll(async () => {
  await server.close();
});

/** A connected client that records every message from the first one on. */
async function connect(claims: RealtimeClaims) {
  const ticket = await createRealtimeTicket(claims, SECRET);
  const socket = new WebSocket(`ws://${base}/api/realtime/ws?ticket=${encodeURIComponent(ticket)}`);
  open.push(socket);
  const messages: any[] = [];
  socket.on("message", (data) => messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return { socket, messages };
}

/** The HTTP status a refused upgrade came back with. */
function upgradeStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    open.push(socket);
    socket.once("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
    socket.once("open", () => reject(new Error("upgrade was accepted")));
    socket.once("error", reject);
  });
}

function event(orgId: string, overrides: Partial<SchedulingEventMessage> = {}): SchedulingEventMessage {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    orgId,
    teacherId: "teacher_1",
    actorId: "actor_admin",
    type: "availability.changed",
    aggregateId: "slot_1",
    committedAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

function publish(body: unknown, secret: string | null = SECRET) {
  return fetch(`http://${base}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const student = (orgId: string, userId = "student_1"): RealtimeClaims => ({
  userId,
  orgId,
  role: "STUDENT",
  teacherId: null,
});

test.describe("Realtime sidecar (Node WebSocket transport)", () => {
  test("GET /healthz answers 200", async () => {
    const res = await fetch(`http://${base}/healthz`);
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  test("a valid ticket connects and receives ready, then a presence snapshot", async () => {
    const { messages } = await connect(student("org_alpha"));
    await expect.poll(() => messages.length).toBeGreaterThanOrEqual(2);
    expect(messages[0]).toEqual({ type: "ready" });
    expect(messages[1].type).toBe("presence.snapshot");
  });

  test("upgrade is refused with 401 for a missing, forged, or wrong-secret ticket", async () => {
    expect(await upgradeStatus(`ws://${base}/api/realtime/ws`)).toBe(401);
    expect(await upgradeStatus(`ws://${base}/api/realtime/ws?ticket=not-a-jwt`)).toBe(401);

    const foreign = await createRealtimeTicket(student("org_alpha"), "some-other-secret-that-is-also-32-chars");
    expect(await upgradeStatus(`ws://${base}/api/realtime/ws?ticket=${foreign}`)).toBe(401);
  });

  test("upgrade on any other path is refused", async () => {
    const ticket = await createRealtimeTicket(student("org_alpha"), SECRET);
    expect(await upgradeStatus(`ws://${base}/publish?ticket=${ticket}`)).toBe(404);
  });

  test("POST /publish requires the service secret", async () => {
    expect((await publish(event("org_alpha"), null)).status).toBe(401);
    expect((await publish(event("org_alpha"), "wrong-secret")).status).toBe(401);
    expect((await publish({ orgId: "org_alpha" })).status).toBe(400);
    expect((await publish(event("org_alpha"))).status).toBe(204);
  });

  test("a published event reaches a subscribed socket", async () => {
    const { socket, messages } = await connect(student("org_alpha"));
    socket.send(JSON.stringify({ type: "subscribe", teacherId: "teacher_1" }));

    await expect
      .poll(async () => {
        await publish(event("org_alpha", { eventId: "evt_mine" }));
        return messages.some((m) => m.eventId === "evt_mine");
      })
      .toBe(true);

    const mine = messages.find((m) => m.eventId === "evt_mine");
    expect(mine.type).toBe("availability.changed");
    expect(mine.teacherId).toBe("teacher_1");
  });

  test("org B's socket never receives org A's event", async () => {
    const a = await connect(student("org_alpha", "student_a"));
    const b = await connect(student("org_beta", "student_b"));

    expect((await publish(event("org_alpha", { eventId: "evt_alpha_only" }))).status).toBe(204);
    await expect.poll(() => a.messages.some((m) => m.eventId === "evt_alpha_only")).toBe(true);

    // A round trip on B's own socket proves anything addressed to it before
    // this point would already have arrived.
    b.socket.send(JSON.stringify({ type: "resync" }));
    await expect.poll(() => b.messages.some((m) => m.type === "resync.required")).toBe(true);
    expect(b.messages.some((m) => m.eventId === "evt_alpha_only")).toBe(false);
  });

  test("a teacher cannot subscribe to another teacher, and presence follows the socket", async () => {
    const watcher = await connect(student("org_gamma"));
    const teacher = await connect({ userId: "teacher_9", orgId: "org_gamma", role: "TEACHER", teacherId: "teacher_9" });

    await expect
      .poll(() => watcher.messages.some((m) => m.type === "presence.changed" && m.teacherId === "teacher_9" && m.online))
      .toBe(true);

    teacher.socket.send(JSON.stringify({ type: "subscribe", teacherId: "teacher_other" }));
    await expect
      .poll(() => teacher.messages.some((m) => m.type === "error" && /another teacher/i.test(m.message)))
      .toBe(true);

    teacher.socket.close();
    await expect
      .poll(() => watcher.messages.some((m) => m.type === "presence.changed" && m.teacherId === "teacher_9" && !m.online))
      .toBe(true);
  });
});
