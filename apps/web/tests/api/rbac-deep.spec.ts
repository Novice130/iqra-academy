import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import {
  sessions,
  studentProfiles,
  users,
  teacherTimeOff,
  breakoutSets,
} from "../../src/db/schema";
import { eq, and } from "drizzle-orm";

test.describe("Phase 10: Deep RBAC, Tenant Isolation & Transaction Rollbacks", () => {
  // ---------------------------------------------------------------------------
  // 1. Cross-Org Denials Across Routes
  // ---------------------------------------------------------------------------
  test("Cross-org: Admin from Org B cannot list, create, or modify users in Org A", async ({
    request,
    orgA,
    orgB,
  }) => {
    const adminBToken = await createTestSession(orgB.admin.id);

    // 1. Admin B tries to list Org A users by querying with their token
    const listRes = await request.get("/api/admin/users", {
      headers: { Cookie: `better-auth.session_token=${adminBToken}` },
    });
    expect(listRes.status()).toBe(200);
    const listBody = await listRes.json();
    // Every user returned MUST belong to Org B, none from Org A
    for (const u of listBody.users || []) {
      expect(u.id).not.toBe(orgA.teacher.id);
      expect(u.id).not.toBe(orgA.student.id);
      expect(u.id).not.toBe(orgA.admin.id);
    }

    // 2. Admin B tries to modify user in Org A
    const patchRes = await request.patch("/api/admin/users", {
      headers: { Cookie: `better-auth.session_token=${adminBToken}` },
      data: {
        userId: orgA.teacher.id,
        role: "STUDENT",
      },
    });
    // Should fail with 404 (user not found in Org B) or 403
    expect([403, 404]).toContain(patchRes.status());

    // 3. Admin B tries to delete user in Org A
    const deleteRes = await request.delete(`/api/admin/users?userId=${orgA.teacher.id}`, {
      headers: { Cookie: `better-auth.session_token=${adminBToken}` },
    });
    expect([403, 404]).toContain(deleteRes.status());
  });

  test("Cross-org: Teacher B cannot view, save, or delete availability of Teacher A", async ({
    request,
    orgA,
    orgB,
  }) => {
    const teacherBToken = await createTestSession(orgB.teacher.id);

    // 1. Query availability of Teacher A
    const getRes = await request.get(`/api/teachers/availability?teacherId=${orgA.teacher.id}`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
    });
    expect([403, 404]).toContain(getRes.status());

    // 2. Mutate availability of Teacher A
    const postRes = await request.post("/api/teachers/availability", {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
      data: {
        teacherId: orgA.teacher.id,
        timezone: "UTC",
        slotMinutes: 30,
        slots: [{ dayOfWeek: "MONDAY", startTime: "09:00", endTime: "10:00" }],
      },
    });
    expect([403, 404]).toContain(postRes.status());

    // 3. Delete availability of Teacher A
    const delRes = await request.delete(`/api/teachers/availability?teacherId=${orgA.teacher.id}`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
    });
    expect([403, 404]).toContain(delRes.status());
  });

  test("Cross-org: Teacher B cannot inspect or create time-off for Teacher A", async ({
    request,
    orgA,
    orgB,
  }) => {
    const teacherBToken = await createTestSession(orgB.teacher.id);

    // 1. Query time-off
    const getRes = await request.get(`/api/teachers/time-off?teacherId=${orgA.teacher.id}`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
    });
    expect([403, 404]).toContain(getRes.status());

    // 2. Insert time-off
    const now = new Date();
    const postRes = await request.post("/api/teachers/time-off", {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
      data: {
        teacherId: orgA.teacher.id,
        startsAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
        endsAt: new Date(now.getTime() + 48 * 3600 * 1000).toISOString(),
        reason: "Unauthorized Vacation",
      },
    });
    expect([403, 404]).toContain(postRes.status());
  });

  test("Cross-org: Slots endpoint isolates teachers by organization", async ({
    request,
    orgA,
    orgB,
  }) => {
    const studentBToken = await createTestSession(orgB.student.id);

    // Student B requests slots for Teacher A (different org)
    const res = await request.get(`/api/availability/slots?teacherId=${orgA.teacher.id}`, {
      headers: { Cookie: `better-auth.session_token=${studentBToken}` },
    });
    // Must return 403 or 404, or empty slots without leaking Org A availability
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.slots || []).toEqual([]);
    } else {
      expect([403, 404]).toContain(res.status());
    }
  });

  test("Cross-org: Non-host or cross-org user cannot access host-tools API", async ({
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
        status: "IN_PROGRESS",
        title: "Host Tools Security Test",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();

    // 1. Teacher B (different org) tries host tool (e.g. lock meeting)
    const teacherBToken = await createTestSession(orgB.teacher.id);
    const crossOrgRes = await request.post(`/api/sessions/${sessionA.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
      data: { action: "lock_meeting", enabled: true },
    });
    expect([403, 404]).toContain(crossOrgRes.status());

    // 2. Student A (same org, but non-host student) tries host tool
    const studentAToken = await createTestSession(orgA.student.id);
    const studentRes = await request.post(`/api/sessions/${sessionA.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${studentAToken}` },
      data: { action: "mute_all" },
    });
    expect(studentRes.status()).toBe(403);
  });

  // ---------------------------------------------------------------------------
  // 2. Protected Root Super Admin Safeguards
  // ---------------------------------------------------------------------------
  test("Protected Super Admin: syedamer130@gmail.com downgrade is strictly blocked", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const adminAToken = await createTestSession(orgA.admin.id);

    // Verify existing super admin user or seed them if running on fresh DB
    let superAdmin = await db.query.users.findFirst({
      where: eq(users.email, "syedamer130@gmail.com"),
    });

    if (!superAdmin) {
      const [seeded] = await db
        .insert(users)
        .values({
          email: "syedamer130@gmail.com",
          name: "Syed Amer",
          role: "SUPER_ADMIN",
          orgId: orgA.orgId,
          emailVerified: true,
          timezone: "America/New_York",
        })
        .returning();
      superAdmin = seeded;
    }

    expect(superAdmin).toBeDefined();
    expect(superAdmin.role).toBe("SUPER_ADMIN");

    // 1. Admin tries to demote super admin to TEACHER
    const demoteTeacher = await request.patch("/api/admin/users", {
      headers: { Cookie: `better-auth.session_token=${adminAToken}` },
      data: {
        userId: superAdmin.id,
        role: "TEACHER",
      },
    });
    expect([403, 404]).toContain(demoteTeacher.status());

    // 2. Admin tries to demote super admin to STUDENT
    const demoteStudent = await request.patch("/api/admin/users", {
      headers: { Cookie: `better-auth.session_token=${adminAToken}` },
      data: {
        userId: superAdmin.id,
        role: "STUDENT",
      },
    });
    expect([403, 404]).toContain(demoteStudent.status());

    // 3. Admin tries to delete super admin
    const deleteRes = await request.delete(`/api/admin/users?userId=${superAdmin.id}`, {
      headers: { Cookie: `better-auth.session_token=${adminAToken}` },
    });
    expect([403, 404]).toContain(deleteRes.status());

    // 4. Admin tries to POST a user with super admin email to re-create or hijack
    const hijackRes = await request.post("/api/admin/users", {
      headers: { Cookie: `better-auth.session_token=${adminAToken}` },
      data: {
        email: "syedamer130@gmail.com",
        role: "TEACHER",
        name: "Fake Impostor",
      },
    });
    expect([403, 400]).toContain(hijackRes.status());

    // Invariant: superAdmin still exists and role remains SUPER_ADMIN
    const persisted = await db.query.users.findFirst({
      where: eq(users.email, "syedamer130@gmail.com"),
    });
    expect(persisted?.role).toBe("SUPER_ADMIN");
  });

  // ---------------------------------------------------------------------------
  // 3. Assignment Validation, Conflict Detection & Transaction Rollback
  // ---------------------------------------------------------------------------
  test("Assign Student: Rejects start times in the past", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const adminToken = await createTestSession(orgA.admin.id);

    const [profile] = await db
      .insert(studentProfiles)
      .values({
        userId: orgA.student.id,
        orgId: orgA.orgId,
        name: "Test Profile Past",
        track: "QAIDAH",
      })
      .returning();

    // Start time 1 hour in the past
    const pastStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const res = await request.post("/api/admin/assign-student", {
      headers: { Cookie: `better-auth.session_token=${adminToken}` },
      data: {
        studentProfileId: profile.id,
        teacherId: orgA.teacher.id,
        track: "QAIDAH",
        scheduledStart: pastStart,
        durationMinutes: 30,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error || body.message).toMatch(/must be in the future/i);
  });

  test("Assign Student: Detects slot conflict and aborts transaction cleanly", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const adminToken = await createTestSession(orgA.admin.id);

    const [profile] = await db
      .insert(studentProfiles)
      .values({
        userId: orgA.student.id,
        orgId: orgA.orgId,
        name: "Conflict Test Student",
        track: "HIFZ",
      })
      .returning();

    // Create an existing conflicting session tomorrow 10:00 - 10:30
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const conflictingEnd = new Date(tomorrow.getTime() + 30 * 60 * 1000);

    await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Pre-existing Scheduled Class",
        scheduledStart: tomorrow,
        scheduledEnd: conflictingEnd,
      })
      .returning();

    const sessionsCountBefore = (await db.query.sessions.findMany({ where: eq(sessions.orgId, orgA.orgId) })).length;

    // Attempt to assign a new class that overlaps (10:15 - 10:45)
    const overlappingStart = new Date(tomorrow.getTime() + 15 * 60 * 1000).toISOString();

    const res = await request.post("/api/admin/assign-student", {
      headers: { Cookie: `better-auth.session_token=${adminToken}` },
      data: {
        studentProfileId: profile.id,
        teacherId: orgA.teacher.id,
        track: "HIFZ",
        scheduledStart: overlappingStart,
        durationMinutes: 30,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error || body.message).toMatch(/already has a scheduled class/i);

    // Rollback verification: Total session row count is strictly unchanged
    const sessionsCountAfter = (await db.query.sessions.findMany({ where: eq(sessions.orgId, orgA.orgId) })).length;
    expect(sessionsCountAfter).toBe(sessionsCountBefore);

    // Verify no orphaned session was created
    const orphanedSessions = await db.query.sessions.findMany({
      where: and(
        eq(sessions.teacherId, orgA.teacher.id),
        eq(sessions.title, "HIFZ Lesson with " + orgA.teacher.name)
      ),
    });
    expect(orphanedSessions.length).toBe(0);
  });

  test("Assign Student: Detects teacher time-off conflict and aborts", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const adminToken = await createTestSession(orgA.admin.id);

    const [profile] = await db
      .insert(studentProfiles)
      .values({
        userId: orgA.student.id,
        orgId: orgA.orgId,
        name: "Time-off Test Student",
        track: "QURAN_READING",
      })
      .returning();

    // Teacher has time-off in 2 days (full day)
    const twoDaysAhead = new Date();
    twoDaysAhead.setDate(twoDaysAhead.getDate() + 2);
    twoDaysAhead.setHours(8, 0, 0, 0);

    const timeOffEnd = new Date(twoDaysAhead.getTime() + 8 * 3600 * 1000);

    await db.insert(teacherTimeOff).values({
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      startsAt: twoDaysAhead,
      endsAt: timeOffEnd,
      reason: "Medical Leave",
    });

    const sessionsCountBefore = (await db.query.sessions.findMany({ where: eq(sessions.orgId, orgA.orgId) })).length;

    // Attempt to assign a class during that time-off window
    const targetStart = new Date(twoDaysAhead.getTime() + 2 * 3600 * 1000).toISOString();

    const res = await request.post("/api/admin/assign-student", {
      headers: { Cookie: `better-auth.session_token=${adminToken}` },
      data: {
        studentProfileId: profile.id,
        teacherId: orgA.teacher.id,
        track: "QURAN_READING",
        scheduledStart: targetStart,
        durationMinutes: 30,
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error || body.message).toMatch(/time off/i);

    // Rollback verification: Total session row count is strictly unchanged
    const sessionsCountAfter = (await db.query.sessions.findMany({ where: eq(sessions.orgId, orgA.orgId) })).length;
    expect(sessionsCountAfter).toBe(sessionsCountBefore);
  });

  test("Assign Student: Cross-org profile and teacher mismatch returns 403", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const adminAToken = await createTestSession(orgA.admin.id);

    // Profile in Org B
    const [profileB] = await db
      .insert(studentProfiles)
      .values({
        userId: orgB.student.id,
        orgId: orgB.orgId,
        name: "Org B Profile",
        track: "QAIDAH",
      })
      .returning();

    const futureStart = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    // Admin A tries to assign Org B profile to Org A teacher
    const res = await request.post("/api/admin/assign-student", {
      headers: { Cookie: `better-auth.session_token=${adminAToken}` },
      data: {
        studentProfileId: profileB.id,
        teacherId: orgA.teacher.id,
        track: "QAIDAH",
        scheduledStart: futureStart,
        durationMinutes: 30,
      },
    });

    expect([403, 404]).toContain(res.status());
  });

  // ---------------------------------------------------------------------------
  // 4. Room-Wide Volume & Host Control Authorization
  // ---------------------------------------------------------------------------
  test("Room-wide volume: Only assigned teacher can set global volume; student receives 403", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "IN_PROGRESS",
        title: "Volume Authorization Class",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();

    // 1. Student attempts to set volume -> 403
    const studentToken = await createTestSession(orgA.student.id);
    const studentRes = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${studentToken}` },
      data: {
        identity: "guest-user",
        volume: 0.5,
      },
    });
    expect(studentRes.status()).toBe(403);

    // 2. Cross-org teacher attempts to set volume -> 403 or 404
    const teacherBToken = await createTestSession(orgB.teacher.id);
    const crossRes = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
      data: {
        identity: "guest-user",
        volume: 0.5,
      },
    });
    expect([403, 404]).toContain(crossRes.status());

    // 3. Assigned teacher sets room-wide volume -> 200 or 502/503 if LiveKit cloud connection is mocked
    const teacherToken = await createTestSession(orgA.teacher.id);
    const teacherRes = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
      data: {
        identity: "guest-user",
        volume: 0.8,
      },
    });
    expect([200, 502, 503]).toContain(teacherRes.status());
    if (teacherRes.status() === 200) {
      const body = await teacherRes.json();
      expect(body.success).toBe(true);
      expect(body.identity).toBe("guest-user");
      expect(body.volume).toBe(0.8);
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Collaboration Models & Breakout Tenant Invariants
  // ---------------------------------------------------------------------------
  test("Collaboration models: breakout lifecycle and whiteboard access enforce RBAC and tenant isolation", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "IN_PROGRESS",
        title: "Collaboration Parity Session",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 45 * 60 * 1000),
      })
      .returning();

    const teacherAToken = await createTestSession(orgA.teacher.id);
    const studentAToken = await createTestSession(orgA.student.id);
    const teacherBToken = await createTestSession(orgB.teacher.id);

    // 1. Cross-org teacher cannot create breakout rooms on Session A
    const crossCreateRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
      data: {
        action: "create",
        rooms: [{ title: "Room 1 - Tajweed Practice" }],
      },
    });
    expect([403, 404]).toContain(crossCreateRes.status());

    // 2. Student A (non-host) cannot create breakout rooms
    const studentCreateRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${studentAToken}` },
      data: {
        action: "create",
        rooms: [{ title: "Student Illegal Room" }],
      },
    });
    expect(studentCreateRes.status()).toBe(403);

    // 3. Assigned Teacher A creates breakout rooms (HTTP CRUD)
    const createRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
      data: {
        action: "create",
        rooms: [
          { title: "Room 1 - Tajweed Practice" },
          { title: "Room 2 - Hifz Practice" },
        ],
      },
    });
    expect(createRes.status()).toBe(200);
    const createBody = await createRes.json();
    expect(createBody.success).toBe(true);
    expect(createBody.rooms).toHaveLength(2);
    const room1Id = createBody.rooms[0].id;

    // 4. GET breakouts: Same-org viewer can read; cross-org viewer denied
    const getBreakoutsA = await request.get(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
    });
    expect(getBreakoutsA.status()).toBe(200);
    const getBreakoutsBody = await getBreakoutsA.json();
    expect(getBreakoutsBody.set).not.toBeNull();
    expect(getBreakoutsBody.set.status).toBe("DRAFT");

    const getBreakoutsB = await request.get(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
    });
    expect([403, 404]).toContain(getBreakoutsB.status());

    // 5. Open breakouts: Teacher A opens; cross-org denied
    const crossOpenRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
      data: { action: "open" },
    });
    expect([403, 404]).toContain(crossOpenRes.status());

    const openRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
      data: { action: "open" },
    });
    expect(openRes.status()).toBe(200);
    const openBody = await openRes.json();
    expect(openBody.success).toBe(true);
    expect(openBody.status).toBe("OPEN");

    // 6. Assign student A to Room 1
    const assignRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
      data: {
        action: "assign",
        assignments: [
          { roomId: room1Id, userId: orgA.student.id, participantIdentity: `student-${orgA.student.id}` },
        ],
      },
    });
    expect(assignRes.status()).toBe(200);
    const assignBody = await assignRes.json();
    expect(assignBody.success).toBe(true);
    expect(assignBody.assigned).toBe(1);

    // 7. Student A requests move-token for assigned Room 1
    const tokenRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${studentAToken}` },
      data: {
        action: "move-token",
        roomId: room1Id,
      },
    });
    expect(tokenRes.status()).toBe(200);
    const tokenBody = await tokenRes.json();
    expect(tokenBody.token).toBeTruthy();
    expect(tokenBody.roomId).toBe(room1Id);

    // 8. Close breakouts
    const closeRes = await request.post(`/api/sessions/${session.id}/breakouts`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
      data: { action: "close" },
    });
    expect(closeRes.status()).toBe(200);
    const closeBody = await closeRes.json();
    expect(closeBody.success).toBe(true);
    expect(closeBody.status).toBe("CLOSED");

    // 9. Whiteboard: GET ticket
    const wbResA = await request.get(`/api/sessions/${session.id}/whiteboard`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
    });
    expect(wbResA.status()).toBe(200);
    const wbBodyA = await wbResA.json();
    expect(wbBodyA.ticket).toBeTruthy();
    expect(wbBodyA.boardId).toBe("main");

    const wbResB = await request.get(`/api/sessions/${session.id}/whiteboard`, {
      headers: { Cookie: `better-auth.session_token=${teacherBToken}` },
    });
    expect([403, 404]).toContain(wbResB.status());

    // 10. Whiteboard: Host controls
    const lockRes = await request.post(`/api/sessions/${session.id}/whiteboard`, {
      headers: { Cookie: `better-auth.session_token=${teacherAToken}` },
      data: { locked: true },
    });
    expect(lockRes.status()).toBe(200);

    const studentLockRes = await request.post(`/api/sessions/${session.id}/whiteboard`, {
      headers: { Cookie: `better-auth.session_token=${studentAToken}` },
      data: { locked: false },
    });
    expect(studentLockRes.status()).toBe(403);

    // Relational integrity check in DB
    const dbSets = await db.query.breakoutSets.findMany({ where: eq(breakoutSets.sessionId, session.id) });
    expect(dbSets.length).toBeGreaterThan(0);
    expect(dbSets[0].orgId).toBe(orgA.orgId);
  });

  test("Cross-org session routes matrix: All session endpoints deny cross-tenant callers", async ({
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
        status: "IN_PROGRESS",
        title: "Cross-Org Matrix Session",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
      })
      .returning();

    const teacherBToken = await createTestSession(orgB.teacher.id);
    const studentBToken = await createTestSession(orgB.student.id);

    const headersTeacherB = { Cookie: `better-auth.session_token=${teacherBToken}` };
    const headersStudentB = { Cookie: `better-auth.session_token=${studentBToken}` };

    // 1. Join endpoint denies cross-org teacher and student
    const joinResT = await request.get(`/api/sessions/${sessionA.id}/join`, { headers: headersTeacherB });
    expect([403, 404]).toContain(joinResT.status());
    const joinResS = await request.get(`/api/sessions/${sessionA.id}/join`, { headers: headersStudentB });
    expect([403, 404]).toContain(joinResS.status());

    // 2. Guests listing and admission denies cross-org
    const guestsGet = await request.get(`/api/sessions/${sessionA.id}/guests`, { headers: headersTeacherB });
    expect([403, 404]).toContain(guestsGet.status());
    const guestsPost = await request.post(`/api/sessions/${sessionA.id}/guests`, {
      headers: headersTeacherB,
      data: { requestId: "req-1", action: "admit" },
    });
    expect([403, 404]).toContain(guestsPost.status());

    // 3. Spotlight denies cross-org
    const spotRes = await request.post(`/api/sessions/${sessionA.id}/spotlight`, {
      headers: headersTeacherB,
      data: { identity: "user-1" },
    });
    expect([403, 404]).toContain(spotRes.status());

    // 4. Mute-participant denies cross-org
    const muteRes = await request.post(`/api/sessions/${sessionA.id}/mute-participant`, {
      headers: headersTeacherB,
      data: { identity: "user-1", trackSource: "microphone" },
    });
    expect([403, 404]).toContain(muteRes.status());

    // 5. Participant management denies cross-org
    const partRes = await request.post(`/api/sessions/${sessionA.id}/participant`, {
      headers: headersTeacherB,
      data: { identity: "user-1", action: "remove" },
    });
    expect([403, 404]).toContain(partRes.status());

    // 6. End session denies cross-org
    const endRes = await request.post(`/api/sessions/${sessionA.id}/end`, {
      headers: headersTeacherB,
      data: { reason: "test" },
    });
    expect([403, 404]).toContain(endRes.status());

    // 7. Screen token denies cross-org
    const screenRes = await request.post(`/api/sessions/${sessionA.id}/screen-token`, {
      headers: headersTeacherB,
    });
    expect([403, 404]).toContain(screenRes.status());
  });

  // ---------------------------------------------------------------------------
  // 6. Perimeter Invariants: Unauthenticated Requests Rejected Everywhere
  // ---------------------------------------------------------------------------
  test("Perimeter invariants: All mutating endpoints reject unauthenticated callers", async ({
    request,
  }) => {
    const endpoints = [
      { method: "post", url: "/api/admin/users", data: {} },
      { method: "patch", url: "/api/admin/users", data: {} },
      { method: "delete", url: "/api/admin/users?userId=test", data: {} },
      { method: "post", url: "/api/admin/assign-student", data: {} },
      { method: "post", url: "/api/teachers/availability", data: {} },
      { method: "post", url: "/api/teachers/time-off", data: {} },
      { method: "post", url: "/api/teachers/instant-meeting", data: {} },
      { method: "post", url: "/api/sessions/sess-xyz/host-tools", data: {} },
      { method: "post", url: "/api/sessions/sess-xyz/volume", data: {} },
      { method: "post", url: "/api/sessions/sess-xyz/spotlight", data: {} },
      { method: "post", url: "/api/sessions/sess-xyz/end", data: {} },
      { method: "patch", url: "/api/sessions/sess-xyz", data: {} },
    ];

    for (const ep of endpoints) {
      const res =
        ep.method === "post"
          ? await request.post(ep.url, { data: ep.data })
          : ep.method === "patch"
          ? await request.patch(ep.url, { data: ep.data })
          : await request.delete(ep.url);

      expect(
        [401, 403],
        `Expected ${ep.method.toUpperCase()} ${ep.url} to reject unauthenticated caller with 401 or 403`
      ).toContain(res.status());
    }
  });
});
