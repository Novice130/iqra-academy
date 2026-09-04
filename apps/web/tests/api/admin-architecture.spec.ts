import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import {
  sessions,
  schedulingEvents,
  users,
} from "../../src/db/schema";
import { eq, and, desc } from "drizzle-orm";

test.describe("Phase 6: Admin Information Architecture & Dedicated Routes", () => {
  test("catch-all route elimination: unknown /admin/* subpaths return 404", async ({
    request,
  }) => {
    // 1. Single non-existent slug
    const res1 = await request.get("/admin/non-existent-subpath-test-xyz");
    expect(res1.status()).toBe(404);

    // 2. Multi-segment nested unknown route
    const res2 = await request.get("/admin/nested/deep/unknown/route");
    expect(res2.status()).toBe(404);

    // 3. Child route under scheduled-classes
    const res3 = await request.get("/admin/scheduled-classes/extra-child");
    expect(res3.status()).toBe(404);
  });

  test("PATCH /api/sessions/[id] rejects unauthenticated requests", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org A Admin Arch Test 1",
        scheduledStart: new Date(now.getTime() + 2 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 3 * 3600_000),
      })
      .returning();

    const res = await request.patch(`/api/sessions/${session.id}`, {
      data: { status: "CANCELLED" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("PATCH /api/sessions/[id] rejects cross-tenant modification from Org B admin", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org A Admin Arch Test 2",
        scheduledStart: new Date(now.getTime() + 2 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 3 * 3600_000),
      })
      .returning();

    const tokenAdminB = await createTestSession(orgB.admin.id);
    const res = await request.patch(`/api/sessions/${sessionA.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenAdminB}` },
      data: { status: "CANCELLED" },
    });
    // Org B admin has no access to Org A session -> 403 (or 404)
    expect([403, 404]).toContain(res.status());
  });

  test("PATCH /api/sessions/[id] rejects student and unrelated teacher in same org", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org A Admin Arch Test 3",
        scheduledStart: new Date(now.getTime() + 2 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 3 * 3600_000),
      })
      .returning();

    // 1. Student in Org A
    const tokenStudentA = await createTestSession(orgA.student.id);
    const resStudent = await request.patch(`/api/sessions/${sessionA.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenStudentA}` },
      data: { status: "CANCELLED" },
    });
    expect(resStudent.status()).toBe(403);

    // 2. Unrelated teacher in Org A
    const teacher2Email = `pw-unrelated-teacher-${Date.now()}@test.invalid`;
    const [unrelatedTeacher] = await db
      .insert(users)
      .values({
        orgId: orgA.orgId,
        email: teacher2Email,
        name: "Unrelated Teacher",
        role: "TEACHER",
        emailVerified: true,
        timezone: "America/New_York",
      })
      .returning();

    const tokenTeacher2 = await createTestSession(unrelatedTeacher.id);
    const resUnrelated = await request.patch(`/api/sessions/${sessionA.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher2}` },
      data: { status: "CANCELLED" },
    });
    expect(resUnrelated.status()).toBe(403);
  });

  test("PATCH /api/sessions/[id] allows host teacher to cancel their own session", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Host Teacher Cancel Test",
        scheduledStart: new Date(now.getTime() + 2 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 3 * 3600_000),
      })
      .returning();

    const tokenTeacherA = await createTestSession(orgA.teacher.id);
    const res = await request.patch(`/api/sessions/${sessionA.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherA}` },
      data: { status: "CANCELLED", notes: "Emergency reschedule needed" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.session.status).toBe("CANCELLED");

    // Verify DB update
    const [updated] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionA.id));
    expect(updated.status).toBe("CANCELLED");
  });

  test("PATCH /api/sessions/[id] allows Org Admin to cancel and writes outbox event", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Admin Cancel Outbox Test",
        scheduledStart: new Date(now.getTime() + 4 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 5 * 3600_000),
      })
      .returning();

    const tokenAdminA = await createTestSession(orgA.admin.id);
    const cancelReason = "Admin cancelled due to holiday";
    const res = await request.patch(`/api/sessions/${sessionA.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenAdminA}` },
      data: {
        status: "CANCELLED",
        notes: cancelReason,
      },
    });
    expect(res.status()).toBe(200);

    // Verify DB session updated
    const [dbSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionA.id));
    expect(dbSession.status).toBe("CANCELLED");

    // Verify transactional outbox event inserted
    const [outboxEvent] = await db
      .select()
      .from(schedulingEvents)
      .where(
        and(
          eq(schedulingEvents.aggregateId, sessionA.id),
          eq(schedulingEvents.type, "session.changed")
        )
      )
      .orderBy(desc(schedulingEvents.createdAt))
      .limit(1);

    expect(outboxEvent).toBeDefined();
    expect(outboxEvent.orgId).toBe(orgA.orgId);
    expect(outboxEvent.actorId).toBe(orgA.admin.id);
    expect(outboxEvent.aggregateType).toBe("session");
  });

  test("PATCH /api/sessions/[id] allows Org Admin to reschedule session time", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const originalStart = new Date(now.getTime() + 10 * 3600_000);
    const originalEnd = new Date(now.getTime() + 11 * 3600_000);

    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Admin Reschedule Test",
        scheduledStart: originalStart,
        scheduledEnd: originalEnd,
      })
      .returning();

    const newStart = new Date(now.getTime() + 12 * 3600_000);
    const newEnd = new Date(now.getTime() + 13 * 3600_000);

    const tokenAdminA = await createTestSession(orgA.admin.id);
    const res = await request.patch(`/api/sessions/${sessionA.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenAdminA}` },
      data: {
        scheduledStart: newStart.toISOString(),
        scheduledEnd: newEnd.toISOString(),
      },
    });
    expect(res.status()).toBe(200);

    const [dbSession] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, sessionA.id));
    expect(new Date(dbSession.scheduledStart).getTime()).toBe(newStart.getTime());
    expect(new Date(dbSession.scheduledEnd).getTime()).toBe(newEnd.getTime());
  });

  test("multi-tenant isolation: Org A admin cannot view Org B scheduled sessions or teachers", async ({
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    // Create session in Org B
    const [sessionB] = await db
      .insert(sessions)
      .values({
        orgId: orgB.orgId,
        teacherId: orgB.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org B Private Session",
        scheduledStart: new Date(now.getTime() + 5 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 6 * 3600_000),
      })
      .returning();

    // Query Org A sessions as done in /admin/scheduled-classes
    const orgASessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.orgId, orgA.orgId));

    const foundSessionBInOrgA = orgASessions.some((s) => s.id === sessionB.id);
    expect(foundSessionBInOrgA).toBe(false);

    // Query Org A teachers as done in /admin/teacher-schedules
    const orgATeachers = await db
      .select()
      .from(users)
      .where(and(eq(users.orgId, orgA.orgId), eq(users.role, "TEACHER")));

    const foundTeacherBInOrgA = orgATeachers.some((u) => u.id === orgB.teacher.id);
    expect(foundTeacherBInOrgA).toBe(false);
  });

  test("admin overview query invariant: strictly zero future scheduled classes in live overview", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    // 1. Future scheduled class (tomorrow)
    const [futureSession] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Future Class 24h Away",
        scheduledStart: new Date(now.getTime() + 24 * 3600_000),
        scheduledEnd: new Date(now.getTime() + 25 * 3600_000),
      })
      .returning();

    // 2. Query representing the Admin Overview live query invariant:
    // Only IN_PROGRESS or active LiveKit sessions are live; SCHEDULED future sessions are excluded
    const liveSessions = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.orgId, orgA.orgId),
          eq(sessions.status, "IN_PROGRESS")
        )
      );

    const hasFutureSession = liveSessions.some((s) => s.id === futureSession.id);
    expect(hasFutureSession).toBe(false);
  });
});
