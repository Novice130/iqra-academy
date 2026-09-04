import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import {
  sessions,
  studentProfiles,
  users,
  teacherTimeOff,
  breakoutSets,
  breakoutRooms,
  breakoutAssignments,
  whiteboards,
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

    // Verify existing super admin user or find them
    const superAdmin = await db.query.users.findFirst({
      where: eq(users.email, "syedamer130@gmail.com"),
    });

    if (superAdmin) {
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
    }

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

    // 1. Student attempts to set volume
    const studentToken = await createTestSession(orgA.student.id);
    const studentRes = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${studentToken}` },
      data: {
        participantIdentity: "guest-user",
        volume: 0.5,
      },
    });
    expect(studentRes.status()).toBe(403);

    // 2. Assigned teacher sets room-wide volume
    const teacherToken = await createTestSession(orgA.teacher.id);
    const teacherRes = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${teacherToken}` },
      data: {
        participantIdentity: "guest-user",
        volume: 0.8,
      },
    });
    // Server route handles volume update or returns 200/502/503 if LiveKit cloud connection is mocked
    expect([200, 502, 503]).toContain(teacherRes.status());
  });

  // ---------------------------------------------------------------------------
  // 5. Collaboration Models & Breakout Tenant Invariants
  // ---------------------------------------------------------------------------
  test("Collaboration models: breakout sets and whiteboards maintain relational integrity", async ({
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
        status: "IN_PROGRESS",
        title: "Collaboration Parity Session",
        scheduledStart: now,
        scheduledEnd: new Date(now.getTime() + 45 * 60 * 1000),
      })
      .returning();

    // 1. Create Breakout Set
    const [bSet] = await db
      .insert(breakoutSets)
      .values({
        orgId: orgA.orgId,
        sessionId: session.id,
        status: "OPEN",
        openedAt: now,
      })
      .returning();

    expect(bSet.orgId).toBe(orgA.orgId);
    expect(bSet.sessionId).toBe(session.id);

    // 2. Create Breakout Room
    const [bRoom] = await db
      .insert(breakoutRooms)
      .values({
        orgId: orgA.orgId,
        breakoutSetId: bSet.id,
        title: "Room 1 - Tajweed Practice",
        videoRoomName: `breakout-${bSet.id}-1`,
        sortOrder: 1,
      })
      .returning();

    expect(bRoom.title).toBe("Room 1 - Tajweed Practice");

    // 3. Create Breakout Assignment
    const [assignment] = await db
      .insert(breakoutAssignments)
      .values({
        orgId: orgA.orgId,
        breakoutRoomId: bRoom.id,
        participantIdentity: `student-${orgA.student.id}`,
        userId: orgA.student.id,
        joinedAt: now,
      })
      .returning();

    expect(assignment.breakoutRoomId).toBe(bRoom.id);

    // 4. Create Whiteboard row
    const [whiteboard] = await db
      .insert(whiteboards)
      .values({
        orgId: orgA.orgId,
        sessionId: session.id,
        boardId: `board-${session.id}`,
        durableObjectKey: `do-wb-${session.id}`,
      })
      .returning();

    expect(whiteboard.boardId).toBe(`board-${session.id}`);
    expect(whiteboard.orgId).toBe(orgA.orgId);
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
