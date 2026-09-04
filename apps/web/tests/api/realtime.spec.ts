import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import {
  schedulingEvents,
  notifications,
} from "../../src/db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import {
  createRealtimeTicket,
  verifyRealtimeTicket,
} from "../../src/lib/realtime/ticket";
import {
  insertSchedulingEvent,
  toSchedulingEventMessage,
} from "../../src/lib/realtime/outbox";
import {
  drainOutbox,
  subscribeLocalHub,
} from "../../src/lib/realtime/outbox-publisher";
import { AvailabilityHub, type HubSocket } from "../../src/realtime/AvailabilityHub";
import type { SchedulingEventType, SchedulingEventMessage } from "../../src/realtime/protocol";

// Setup MockWebSocketPair for AvailabilityHub testing in Node.js
class MockWebSocket {
  sent: string[] = [];
  attachment: any = null;
  readyState = 1;
  serializeAttachment(val: any) {
    this.attachment = val;
  }
  deserializeAttachment() {
    return this.attachment;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

class MockWebSocketPair {
  0: MockWebSocket;
  1: MockWebSocket;
  constructor() {
    this[0] = new MockWebSocket();
    this[1] = new MockWebSocket();
  }
}

if (typeof (globalThis as any).WebSocketPair === "undefined") {
  (globalThis as any).WebSocketPair = MockWebSocketPair;
}

function createMockHubState() {
  const sockets: HubSocket[] = [];
  const alarms: number[] = [];
  return {
    acceptWebSocket(s: HubSocket) {
      sockets.push(s);
    },
    getWebSockets() {
      return sockets;
    },
    storage: {
      async setAlarm(t: number) {
        alarms.push(t);
      },
    },
  };
}

test.describe("Phase 4: Realtime Protocol & Cryptographic Ticket Verification", () => {
  const TEST_SECRET = "test-realtime-jwt-secret-at-least-32-chars-long";

  test("createRealtimeTicket generates verifiable JWT with 2-minute expiration", async () => {
    const claims = {
      userId: "usr_student_1",
      orgId: "org_alpha",
      role: "STUDENT" as const,
      teacherId: null,
    };

    const ticket = await createRealtimeTicket(claims, TEST_SECRET);
    expect(typeof ticket).toBe("string");
    expect(ticket.split(".").length).toBe(3);

    const verified = await verifyRealtimeTicket(ticket, TEST_SECRET);
    expect(verified.userId).toBe(claims.userId);
    expect(verified.orgId).toBe(claims.orgId);
    expect(verified.role).toBe("STUDENT");
    expect(verified.teacherId).toBeNull();
  });

  test("ticket for teacher populates teacherId matching userId", async () => {
    const claims = {
      userId: "usr_teacher_1",
      orgId: "org_alpha",
      role: "TEACHER" as const,
      teacherId: "usr_teacher_1",
    };

    const ticket = await createRealtimeTicket(claims, TEST_SECRET);
    const verified = await verifyRealtimeTicket(ticket, TEST_SECRET);
    expect(verified.userId).toBe("usr_teacher_1");
    expect(verified.teacherId).toBe("usr_teacher_1");
  });

  test("verifyRealtimeTicket rejects tampered tickets or wrong secrets", async () => {
    const claims = {
      userId: "usr_student_1",
      orgId: "org_alpha",
      role: "STUDENT" as const,
      teacherId: null,
    };

    const ticket = await createRealtimeTicket(claims, TEST_SECRET);

    // 1. Verification with wrong secret fails
    await expect(
      verifyRealtimeTicket(ticket, "completely-different-signing-secret-value")
    ).rejects.toThrow();

    // 2. Tampered token fails
    const tampered = ticket.slice(0, -5) + "abcde";
    await expect(verifyRealtimeTicket(tampered, TEST_SECRET)).rejects.toThrow();
  });
});

test.describe("Phase 4: AvailabilityHub DO Tenant Isolation & Authorization", () => {
  const HUB_SECRET = "test-hub-secret-with-minimum-32-characters";

  test("POST /publish requires Bearer secret authorization", async () => {
    const state = createMockHubState();
    const hub = new AvailabilityHub(state, { REALTIME_SECRET: HUB_SECRET });
    hub.setOrgId("org_alpha");

    const validEvent: SchedulingEventMessage = {
      eventId: "evt_1",
      orgId: "org_alpha",
      teacherId: "teacher_1",
      actorId: "actor_1",
      type: "availability.changed",
      aggregateId: "agg_1",
      committedAt: new Date().toISOString(),
      version: 1,
    };

    // 1. Missing Authorization header
    const reqNoAuth = new Request("https://hub/publish", {
      method: "POST",
      body: JSON.stringify(validEvent),
    });
    const resNoAuth = await hub.fetch(reqNoAuth);
    expect(resNoAuth.status).toBe(401);

    // 2. Invalid Authorization header
    const reqBadAuth = new Request("https://hub/publish", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
      body: JSON.stringify(validEvent),
    });
    const resBadAuth = await hub.fetch(reqBadAuth);
    expect(resBadAuth.status).toBe(401);

    // 3. Valid Authorization header succeeds
    const reqValid = new Request("https://hub/publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(validEvent),
    });
    const resValid = await hub.fetch(reqValid);
    expect(resValid.status).toBe(204);
  });

  test("POST /publish rejects cross-tenant events", async () => {
    const state = createMockHubState();
    const hub = new AvailabilityHub(state, { REALTIME_SECRET: HUB_SECRET });
    hub.setOrgId("org_alpha");

    const crossOrgEvent: SchedulingEventMessage = {
      eventId: "evt_cross",
      orgId: "org_beta", // Mismatch with org_alpha
      teacherId: "teacher_2",
      actorId: "actor_2",
      type: "booking.created",
      aggregateId: "agg_2",
      committedAt: new Date().toISOString(),
      version: 1,
    };

    const req = new Request("https://hub/publish", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HUB_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(crossOrgEvent),
    });

    const res = await hub.fetch(req);
    expect(res.status).toBe(403);
  });

  test("WebSocket upgrade rejects missing, invalid, or cross-org tickets", async () => {
    const state = createMockHubState();
    const hub = new AvailabilityHub(state, { REALTIME_SECRET: HUB_SECRET });
    hub.setOrgId("org_alpha");

    // 1. Missing ticket
    const reqNoTicket = new Request("https://hub/ws", {
      headers: { Upgrade: "websocket" },
    });
    const resNoTicket = await hub.fetch(reqNoTicket);
    expect(resNoTicket.status).toBe(401);

    // 2. Ticket signed for org_beta connecting to org_alpha Hub
    const crossOrgTicket = await createRealtimeTicket(
      {
        userId: "student_b",
        orgId: "org_beta",
        role: "STUDENT",
        teacherId: null,
      },
      HUB_SECRET
    );
    const reqCrossOrg = new Request(`https://hub/ws?ticket=${crossOrgTicket}`, {
      headers: { Upgrade: "websocket" },
    });
    const resCrossOrg = await hub.fetch(reqCrossOrg);
    expect(resCrossOrg.status).toBe(403);

    // 3. Valid ticket for org_alpha connects successfully (HTTP 101)
    const validTicket = await createRealtimeTicket(
      {
        userId: "student_a",
        orgId: "org_alpha",
        role: "STUDENT",
        teacherId: null,
      },
      HUB_SECRET
    );
    const reqValid = new Request(`https://hub/ws?ticket=${validTicket}`, {
      headers: { Upgrade: "websocket" },
    });
    const resValid = await hub.fetch(reqValid);
    expect(resValid.status).toBe(101);
  });

  test("teacher cannot subscribe to another teacher's stream", async () => {
    const state = createMockHubState();
    const hub = new AvailabilityHub(state, { REALTIME_SECRET: HUB_SECRET });
    hub.setOrgId("org_alpha");

    const teacherTicket = await createRealtimeTicket(
      {
        userId: "teacher_1",
        orgId: "org_alpha",
        role: "TEACHER",
        teacherId: "teacher_1",
      },
      HUB_SECRET
    );

    const upgradeReq = new Request(`https://hub/ws?ticket=${teacherTicket}`, {
      headers: { Upgrade: "websocket" },
    });
    await hub.fetch(upgradeReq);

    const serverSocket = state.getWebSockets()[0];
    expect(serverSocket).toBeDefined();

    // Teacher 1 attempts to subscribe to Teacher 2
    await hub.webSocketMessage(
      serverSocket,
      JSON.stringify({ type: "subscribe", teacherId: "teacher_2" })
    );

    const lastMsg = JSON.parse(
      (serverSocket as unknown as MockWebSocket).sent.slice(-1)[0]
    );
    expect(lastMsg.type).toBe("error");
    expect(lastMsg.message).toMatch(/cannot subscribe to another teacher/i);
  });

  test("events for Org A are broadcast to Org A sockets and never to Org B", async () => {
    // Hub A (Org A)
    const stateA = createMockHubState();
    const hubA = new AvailabilityHub(stateA, { REALTIME_SECRET: HUB_SECRET });
    hubA.setOrgId("org_alpha");

    const ticketA = await createRealtimeTicket(
      { userId: "student_a", orgId: "org_alpha", role: "STUDENT", teacherId: null },
      HUB_SECRET
    );
    await hubA.fetch(
      new Request(`https://hub/ws?ticket=${ticketA}`, {
        headers: { Upgrade: "websocket" },
      })
    );
    const socketA = stateA.getWebSockets()[0] as unknown as MockWebSocket;

    // Hub B (Org B)
    const stateB = createMockHubState();
    const hubB = new AvailabilityHub(stateB, { REALTIME_SECRET: HUB_SECRET });
    hubB.setOrgId("org_beta");

    const ticketB = await createRealtimeTicket(
      { userId: "student_b", orgId: "org_beta", role: "STUDENT", teacherId: null },
      HUB_SECRET
    );
    await hubB.fetch(
      new Request(`https://hub/ws?ticket=${ticketB}`, {
        headers: { Upgrade: "websocket" },
      })
    );
    const socketB = stateB.getWebSockets()[0] as unknown as MockWebSocket;

    // Clear initial handshake messages
    socketA.sent = [];
    socketB.sent = [];

    // Publish event to Hub A
    const orgAEvent: SchedulingEventMessage = {
      eventId: "evt_alpha_1",
      orgId: "org_alpha",
      teacherId: "teacher_1",
      actorId: "actor_admin",
      type: "availability.changed",
      aggregateId: "slot_123",
      committedAt: new Date().toISOString(),
      version: 1,
    };

    const pubRes = await hubA.fetch(
      new Request("https://hub/publish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HUB_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orgAEvent),
      })
    );
    expect(pubRes.status).toBe(204);

    // Socket A in Org A received the event
    expect(socketA.sent.length).toBe(1);
    const receivedEventA = JSON.parse(socketA.sent[0]);
    expect(receivedEventA.eventId).toBe("evt_alpha_1");
    expect(receivedEventA.type).toBe("availability.changed");

    // Socket B in Org B received ZERO events
    expect(socketB.sent.length).toBe(0);
  });
});

test.describe("Phase 4: Outbox Message Protocol & Event Types", () => {
  test("toSchedulingEventMessage formats all 8 mandatory fields with version", () => {
    const rawDbRow = {
      id: "evt_db_123",
      orgId: "org_alpha",
      teacherId: "teacher_abc",
      actorId: "actor_xyz",
      type: "session.changed",
      aggregateId: "session_456",
      createdAt: new Date("2026-09-04T12:00:00Z"),
      version: 2,
      publishedAt: null,
      attempts: 0,
    };

    const message = toSchedulingEventMessage(rawDbRow);

    expect(message).toEqual({
      eventId: "evt_db_123",
      orgId: "org_alpha",
      teacherId: "teacher_abc",
      actorId: "actor_xyz",
      type: "session.changed",
      aggregateId: "session_456",
      committedAt: "2026-09-04T12:00:00.000Z",
      version: 2,
    });
  });

  test("all 7 canonical event types are supported by protocol", () => {
    const canonicalTypes: SchedulingEventType[] = [
      "availability.changed",
      "time_off.changed",
      "booking.created",
      "booking.cancelled",
      "session.changed",
      "class.live",
      "class.ended",
    ];

    for (const type of canonicalTypes) {
      const msg: SchedulingEventMessage = {
        eventId: createId(),
        orgId: "org_alpha",
        teacherId: "teacher_1",
        actorId: "usr_1",
        type,
        aggregateId: "agg_1",
        committedAt: new Date().toISOString(),
        version: 1,
      };
      expect(msg.type).toBe(type);
      expect(msg.version).toBeGreaterThanOrEqual(1);
    }
  });
});

test.describe("Phase 4: API Endpoints & Tenant Isolation Integration", () => {
  test("POST /api/realtime/ticket rejects unauthenticated requests", async ({
    request,
  }) => {
    const res = await request.post("/api/realtime/ticket");
    expect(res.status()).toBe(401);
  });

  test("POST /api/realtime/ticket issues ticket with correct claims for student and teacher", async ({
    request,
    orgA,
  }) => {
    // 1. Student ticket
    const studentToken = await createTestSession(orgA.student.id);
    const studentRes = await request.post("/api/realtime/ticket", {
      headers: { Cookie: `better-auth.session_token=${studentToken}` },
    });
    expect(studentRes.status()).toBe(200);
    const studentData = await studentRes.json();
    expect(studentData.ticket).toBeTruthy();

    const secret = process.env.REALTIME_SECRET || "novicetutor-realtime-secret";
    const studentClaims = await verifyRealtimeTicket(studentData.ticket, secret);
    expect(studentClaims.userId).toBe(orgA.student.id);
    expect(studentClaims.orgId).toBe(orgA.orgId);
    expect(studentClaims.role).toBe("STUDENT");
    expect(studentClaims.teacherId).toBeNull();

    // 2. Teacher ticket
    const teacherToken = await createTestSession(orgA.teacher.id);
    const teacherRes = await request.post("/api/realtime/ticket", {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
    });
    expect(teacherRes.status()).toBe(200);
    const teacherData = await teacherRes.json();
    const teacherClaims = await verifyRealtimeTicket(teacherData.ticket, secret);
    expect(teacherClaims.userId).toBe(orgA.teacher.id);
    expect(teacherClaims.orgId).toBe(orgA.orgId);
    expect(teacherClaims.role).toBe("TEACHER");
    expect(teacherClaims.teacherId).toBe(orgA.teacher.id);
  });

  test("POST /api/realtime/drain-outbox rejects requests without valid secret", async ({
    request,
  }) => {
    // 1. Without auth header -> 401
    const resNoAuth = await request.post("/api/realtime/drain-outbox");
    expect(resNoAuth.status()).toBe(401);

    // 2. With bad auth header -> 401
    const resBadAuth = await request.post("/api/realtime/drain-outbox", {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    expect(resBadAuth.status()).toBe(401);
  });

  test("POST /api/realtime/drain-outbox drains outbox when authorized with database", async ({
    request,
    orgA,
  }) => {
    const secret = process.env.REALTIME_SECRET || "novicetutor-realtime-secret";
    const resValid = await request.post("/api/realtime/drain-outbox", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(resValid.status()).toBe(200);
    const data = await resValid.json();
    expect(data.success).toBe(true);
    expect(typeof data.published).toBe("number");
  });

  test("transactional outbox inserts row with version and publishes via drainOutbox", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const eventAggregateId = createId();

    // 1. Insert scheduling event inside transaction
    const [inserted] = await db.transaction(async (tx) => {
      return insertSchedulingEvent(tx, {
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        actorId: orgA.admin.id,
        type: "availability.changed",
        aggregateType: "availability",
        aggregateId: eventAggregateId,
      });
    });

    expect(inserted).toBeDefined();
    expect(inserted.version).toBe(1);
    expect(inserted.publishedAt).toBeNull();
    expect(inserted.attempts).toBe(0);

    // 2. Track dispatch using local hub subscriber
    let receivedEvent: any = null;
    const unsubscribe = subscribeLocalHub(orgA.orgId, (event) => {
      if (event.aggregateId === eventAggregateId) {
        receivedEvent = event;
      }
    });

    try {
      const result = await drainOutbox({ orgId: orgA.orgId });
      expect(result.published).toBeGreaterThanOrEqual(1);

      // Verify the event was marked as published in the DB
      const updatedRow = await db.query.schedulingEvents.findFirst({
        where: eq(schedulingEvents.id, inserted.id),
      });
      expect(updatedRow?.publishedAt).not.toBeNull();

      // Verify subscriber received the canonical message
      expect(receivedEvent).toBeDefined();
      expect(receivedEvent?.type).toBe("availability.changed");
      expect(receivedEvent?.orgId).toBe(orgA.orgId);
      expect(receivedEvent?.version).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  test("outbox publisher skips events exceeding dead-letter threshold of 5 attempts", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const deadLetterId = createId();

    // Create an event that already failed 5 times
    await db.insert(schedulingEvents).values({
      id: deadLetterId,
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      actorId: orgA.admin.id,
      type: "session.changed",
      aggregateType: "session",
      aggregateId: "dead-letter-session",
      version: 1,
      attempts: 5, // Exceeded threshold
      publishedAt: null,
    });

    // Drain should not publish or touch this row
    await drainOutbox({ orgId: orgA.orgId });

    const row = await db.query.schedulingEvents.findFirst({
      where: eq(schedulingEvents.id, deadLetterId),
    });

    expect(row?.publishedAt).toBeNull();
    expect(row?.attempts).toBe(5);
  });

  test("admin editing availability creates unread notification; acknowledging marks isRead true", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const adminToken = await createTestSession(orgA.admin.id);
    const teacherToken = await createTestSession(orgA.teacher.id);

    // 1. Admin sets availability for teacher A
    const putRes = await request.post("/api/teachers/availability", {
      headers: { Cookie: `better-auth.session_token=${adminToken}` },
      data: {
        teacherId: orgA.teacher.id,
        slots: [
          {
            dayOfWeek: "TUESDAY",
            startTime: "10:00",
            endTime: "11:00",
          },
        ],
      },
    });
    expect(putRes.status()).toBe(200);

    // 2. Query unread AVAILABILITY_CHANGED notification for teacher
    const notification = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, orgA.teacher.id),
        eq(notifications.orgId, orgA.orgId),
        eq(notifications.type, "AVAILABILITY_CHANGED"),
        eq(notifications.isRead, false)
      ),
    });
    expect(notification).toBeDefined();
    expect(notification?.payload).toBeTruthy();

    // 3. Teacher acknowledges the notification (mark as read)
    const patchRes = await request.patch("/api/notifications", {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
      data: { notificationId: notification!.id },
    });
    expect(patchRes.status()).toBe(200);

    // 4. Verify notification is now read (modal will not show again)
    const updatedNotification = await db.query.notifications.findFirst({
      where: eq(notifications.id, notification!.id),
    });
    expect(updatedNotification?.isRead).toBe(true);

    // 5. Teacher editing their OWN availability creates NO new notification
    const teacherSelfRes = await request.post("/api/teachers/availability", {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
      data: {
        slots: [
          {
            dayOfWeek: "WEDNESDAY",
            startTime: "14:00",
            endTime: "15:00",
          },
        ],
      },
    });
    expect(teacherSelfRes.status()).toBe(200);

    const newSelfNotif = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.userId, orgA.teacher.id),
        eq(notifications.type, "AVAILABILITY_CHANGED"),
        eq(notifications.isRead, false)
      ),
    });
    expect(newSelfNotif).toBeUndefined();
  });
});
