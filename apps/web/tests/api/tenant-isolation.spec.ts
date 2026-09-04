import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import { sessions, studentProfiles, users } from "../../src/db/schema";
import { eq } from "drizzle-orm";

test.describe("Phase 1: Tenant Isolation & P0 Authorization", () => {
  test("User from Org B cannot join or access session from Org A", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000); // 5 mins ago
    const end = new Date(now.getTime() + 25 * 60 * 1000); // 25 mins ahead

    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org A Quran Class",
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();

    // 1. Student B (Org B) tries to join session A
    const tokenStudentB = await createTestSession(orgB.student.id);
    const joinResStudentB = await request.get(`/api/sessions/${sessionA.id}/join`, {
      headers: { Cookie: `better-auth.session_token=${tokenStudentB}` },
    });
    expect(joinResStudentB.status()).toBe(403);

    // 2. Teacher B (Org B) tries to join session A
    const tokenTeacherB = await createTestSession(orgB.teacher.id);
    const joinResTeacherB = await request.get(`/api/sessions/${sessionA.id}/join`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherB}` },
    });
    expect(joinResTeacherB.status()).toBe(403);

    // 3. Teacher B (Org B) tries host control: end session A
    const endRes = await request.post(`/api/sessions/${sessionA.id}/end`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherB}` },
    });
    expect(endRes.status()).toBe(403);

    // 4. Teacher B (Org B) tries host control: spotlight on session A
    const spotlightRes = await request.post(`/api/sessions/${sessionA.id}/spotlight`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherB}` },
      data: { identity: "someone", enabled: true },
    });
    expect(spotlightRes.status()).toBe(403);
  });

  test("Student in Org A without a booking cannot join session in Org A", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const end = new Date(now.getTime() + 25 * 60 * 1000);

    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org A Unbooked Class",
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();

    // Student A has no booking on session A
    const tokenStudentA = await createTestSession(orgA.student.id);
    const res = await request.get(`/api/sessions/${sessionA.id}/join`, {
      headers: { Cookie: `better-auth.session_token=${tokenStudentA}` },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not booked for this session/i);
  });

  test("Unrelated teacher in Org A cannot control host functions of another teacher's session", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const end = new Date(now.getTime() + 25 * 60 * 1000);

    // Create session assigned to primary teacher A
    const [sessionA] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Org A Teacher A Class",
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();

    // Create a second teacher in Org A
    const teacher2Email = `pw-teacher-2-a-${Date.now()}@test.invalid`;
    const [teacherA2] = await db
      .insert(users)
      .values({
        orgId: orgA.orgId,
        email: teacher2Email,
        name: "PW Teacher 2 A",
        role: "TEACHER",
        emailVerified: true,
        timezone: "America/New_York",
      })
      .returning();

    const tokenTeacherA2 = await createTestSession(teacherA2.id);

    // Unrelated teacher attempts to end session
    const endRes = await request.post(`/api/sessions/${sessionA.id}/end`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherA2}` },
    });
    expect(endRes.status()).toBe(403);

    // Unrelated teacher attempts to adjust volume
    const volRes = await request.post(`/api/sessions/${sessionA.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherA2}` },
      data: { volume: 0.8 },
    });
    expect(volRes.status()).toBe(403);
  });

  test("Root super admin cannot be modified or re-created via admin users API", async ({
    request,
    orgA,
  }) => {
    const tokenAdminA = await createTestSession(orgA.admin.id);

    // 1. Admin A attempts to POST root super admin email
    const postRes = await request.post("/api/admin/users", {
      headers: { Cookie: `better-auth.session_token=${tokenAdminA}` },
      data: {
        email: "syedamer130@gmail.com",
        name: "Attacker",
        role: "STUDENT",
      },
    });
    expect(postRes.status()).toBe(403);

    // 2. Admin A attempts to DELETE root super admin
    const { db } = getTestDb();
    const rootAdmin = await db.query.users.findFirst({
      where: eq(users.email, "syedamer130@gmail.com"),
    });

    if (rootAdmin) {
      const deleteRes = await request.delete(`/api/admin/users?userId=${rootAdmin.id}`, {
        headers: { Cookie: `better-auth.session_token=${tokenAdminA}` },
      });
      expect(deleteRes.status()).toBe(403);
    }
  });

  test("Teacher cannot view or modify availability of teacher from another org", async ({
    request,
    orgA,
    orgB,
  }) => {
    const tokenTeacherB = await createTestSession(orgB.teacher.id);

    // Teacher B tries to view Teacher A's availability
    const getRes = await request.get(`/api/teachers/availability?teacherId=${orgA.teacher.id}`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherB}` },
    });
    expect(getRes.status()).toBe(403);

    // Teacher B tries to save availability for Teacher A
    const postRes = await request.post("/api/teachers/availability", {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherB}` },
      data: {
        teacherId: orgA.teacher.id,
        slots: [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }],
      },
    });
    expect(postRes.status()).toBe(403);
  });

  test("Admin cannot assign student or teacher from another org", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const tokenAdminA = await createTestSession(orgA.admin.id);

    // Create student profile in Org A and Org B
    const [profileA] = await db
      .insert(studentProfiles)
      .values({
        orgId: orgA.orgId,
        userId: orgA.student.id,
        name: "Profile Student A",
        track: "QAIDAH",
      })
      .returning();

    const [profileB] = await db
      .insert(studentProfiles)
      .values({
        orgId: orgB.orgId,
        userId: orgB.student.id,
        name: "Profile Student B",
        track: "QAIDAH",
      })
      .returning();

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Assign cross-org student profile B with Org A teacher
    const crossStudentRes = await request.post("/api/admin/assign-student", {
      headers: { Cookie: `better-auth.session_token=${tokenAdminA}` },
      data: {
        studentProfileId: profileB.id,
        teacherId: orgA.teacher.id,
        track: "QAIDAH",
        startTime: futureStart,
        durationMinutes: 30,
      },
    });
    expect(crossStudentRes.status()).toBe(403);

    // 2. Assign same-org student profile A with cross-org teacher B
    const crossTeacherRes = await request.post("/api/admin/assign-student", {
      headers: { Cookie: `better-auth.session_token=${tokenAdminA}` },
      data: {
        studentProfileId: profileA.id,
        teacherId: orgB.teacher.id,
        track: "QAIDAH",
        startTime: futureStart,
        durationMinutes: 30,
      },
    });
    expect(crossTeacherRes.status()).toBe(403);
  });
});

test.describe("Phase 1: Unauthenticated Perimeter Rejections", () => {
  test("All session mutations reject unauthenticated requests", async ({ request }) => {
    const fakeId = "sess_nonexistent_123";

    const endpoints = [
      { method: "get", path: `/api/sessions/${fakeId}/join` },
      { method: "post", path: `/api/sessions/${fakeId}/end` },
      { method: "post", path: `/api/sessions/${fakeId}/volume`, data: { volume: 0.5 } },
      { method: "post", path: `/api/sessions/${fakeId}/spotlight`, data: { identity: "x", enabled: true } },
      { method: "post", path: `/api/sessions/${fakeId}/mute-participant`, data: { identity: "x" } },
      { method: "post", path: `/api/sessions/${fakeId}/participant`, data: { identity: "x", action: "mute" } },
      { method: "get", path: `/api/sessions/${fakeId}/screen-token` },
      { method: "get", path: `/api/sessions/${fakeId}/guests` },
      { method: "post", path: "/api/admin/assign-student", data: {} },
      { method: "delete", path: "/api/admin/users?userId=some_id" },
      { method: "get", path: "/api/teachers/availability" },
      { method: "post", path: "/api/teachers/availability", data: { slots: [] } },
      { method: "get", path: "/api/teachers/time-off" },
      { method: "post", path: "/api/teachers/time-off", data: {} },
    ];

    for (const ep of endpoints) {
      let res;
      if (ep.method === "get") {
        res = await request.get(ep.path);
      } else if (ep.method === "delete") {
        res = await request.delete(ep.path);
      } else {
        res = await request.post(ep.path, { data: ep.data });
      }
      expect([401, 403]).toContain(res.status());
    }
  });
});
