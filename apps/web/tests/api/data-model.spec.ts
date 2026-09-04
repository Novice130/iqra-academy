import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import { sessions, bookings, teacherAvailability, teacherTimeOff, notifications } from "../../src/db/schema";
import { and, eq } from "drizzle-orm";

test.describe("Phase 2: Data Model, Constraints, and Migration Parity", () => {
  test("sessions enforce origin and scheduledEnd > scheduledStart check", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    // 1. Valid session with default origin 'SCHEDULED'
    const [validSession] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Phase 2 Valid Session",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();

    expect(validSession.origin).toBe("SCHEDULED");

    // 2. Invalid session with scheduledEnd <= scheduledStart fails check constraint
    let errorThrown = false;
    try {
      await db.insert(sessions).values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Phase 2 Invalid Session",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() - 10 * 60 * 1000), // in the past!
      });
    } catch {
      errorThrown = true;
    }
    expect(errorThrown).toBe(true);
  });

  test("teacher availability and time-off enforce end > start check constraints", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    // 1. teacherAvailability check constraint: endTime <= startTime fails
    let availError = false;
    try {
      await db.insert(teacherAvailability).values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        dayOfWeek: "MONDAY",
        startTime: "16:00",
        endTime: "15:00", // invalid
        timezone: "UTC",
      });
    } catch {
      availError = true;
    }
    expect(availError).toBe(true);

    // 2. teacherTimeOff check constraint: endsAt <= startsAt fails
    let timeOffError = false;
    try {
      await db.insert(teacherTimeOff).values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        startsAt: now,
        endsAt: new Date(now.getTime() - 60 * 1000), // invalid
        reason: "Vacation",
      });
    } catch {
      timeOffError = true;
    }
    expect(timeOffError).toBe(true);
  });

  test("bookings enforce uniqueness on (orgId, userId, sessionId)", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    const [testSession] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Uniqueness Test Session",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();

    // First booking succeeds
    await db.insert(bookings).values({
      orgId: orgA.orgId,
      userId: orgA.student.id,
      sessionId: testSession.id,
      status: "CONFIRMED",
    });

    // Duplicate booking for same user and session fails unique index
    let dupError = false;
    try {
      await db.insert(bookings).values({
        orgId: orgA.orgId,
        userId: orgA.student.id,
        sessionId: testSession.id,
        status: "CONFIRMED",
      });
    } catch {
      dupError = true;
    }
    expect(dupError).toBe(true);
  });

  test("admin updating teacher availability creates AVAILABILITY_CHANGED notification with structured payload", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const adminToken = await createTestSession(orgA.admin.id);

    // Admin sets availability for teacher in org A
    const res = await request.post("/api/teachers/availability", {
      headers: { Cookie: `better-auth.session_token=${adminToken}` },
      data: {
        teacherId: orgA.teacher.id,
        timezone: "UTC",
        slotMinutes: 30,
        slots: [
          {
            dayOfWeek: "TUESDAY",
            startTime: "09:00",
            endTime: "12:00",
          },
        ],
      },
    });

    expect(res.status()).toBe(200);

    // Verify notification was created for teacher with type AVAILABILITY_CHANGED
    const notif = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.orgId, orgA.orgId),
        eq(notifications.userId, orgA.teacher.id),
        eq(notifications.type, "AVAILABILITY_CHANGED")
      ),
      orderBy: (n, { desc }) => [desc(n.createdAt)],
    });

    expect(notif).toBeDefined();
    expect(notif?.type).toBe("AVAILABILITY_CHANGED");
    expect(notif?.payload).toMatchObject({
      teacherId: orgA.teacher.id,
      after: [
        {
          dayOfWeek: "TUESDAY",
          startTime: "09:00",
          endTime: "12:00",
          timezone: "UTC",
        },
      ],
    });
  });

  test("instant meeting creation assigns INSTANT origin and cleanup queries by origin", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const teacherToken = await createTestSession(orgA.teacher.id);

    // Teacher creates an instant meeting
    const res = await request.post("/api/teachers/instant-meeting", {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
      data: {},
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();

    // Verify origin is INSTANT in db
    const createdSession = await db.query.sessions.findFirst({
      where: eq(sessions.id, body.sessionId),
    });
    expect(createdSession?.origin).toBe("INSTANT");

    // Run cleanup
    const cleanupRes = await request.post("/api/teachers/instant-meeting/cleanup", {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
    });
    expect(cleanupRes.status()).toBe(200);
    const cleanupBody = await cleanupRes.json();
    expect(cleanupBody.success).toBe(true);
  });
});
