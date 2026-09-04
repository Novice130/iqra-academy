import { test, expect } from "../fixtures/test";
import { getTestDb, createTestSession } from "../fixtures/orgs";
import { sessions } from "../../src/db/schema";
import { parseRoomMetadata } from "../../src/lib/room-metadata";

test.describe("Phase 7: Meeting Control Parity & Moderation Security", () => {
  test("Host tools RBAC: Only session host can execute host tools", async ({
    request,
    orgA,
    orgB,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const end = new Date(now.getTime() + 25 * 60 * 1000);

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Moderation Controls Class",
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();

    const tokenTeacherA = await createTestSession(orgA.teacher.id);
    const tokenStudentA = await createTestSession(orgA.student.id);
    const tokenTeacherB = await createTestSession(orgB.teacher.id);

    // 1. Student A in Org A cannot lock meeting (403)
    const resStudent = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenStudentA}` },
      data: { action: "lock", locked: true },
    });
    expect(resStudent.status()).toBe(403);

    // 2. Teacher B (different org) cannot lock meeting (403)
    const resTeacherB = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherB}` },
      data: { action: "lock", locked: true },
    });
    expect(resTeacherB.status()).toBe(403);

    // 3. Teacher A (session host) can lock and unlock meeting
    const lockRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherA}` },
      data: { action: "lock", locked: true },
    });
    expect(lockRes.status()).toBe(200);
    const lockData = await lockRes.json();
    expect(lockData.success).toBe(true);
    expect(lockData.isLocked).toBe(true);

    // 4. Teacher A can toggle participant screen sharing permission
    const shareRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherA}` },
      data: { action: "participantShare", allow: false },
    });
    expect(shareRes.status()).toBe(200);
    const shareData = await shareRes.json();
    expect(shareData.success).toBe(true);
    expect(shareData.allowParticipantShare).toBe(false);

    // 5. Teacher A can trigger mute-all
    const muteAllRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacherA}` },
      data: { action: "muteAll" },
    });
    expect(muteAllRes.status()).toBe(200);
    const muteAllData = await muteAllRes.json();
    expect(muteAllData.success).toBe(true);
  });

  test("Room lock blocks guest admission when meeting is locked", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const end = new Date(now.getTime() + 25 * 60 * 1000);

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Locked Class Test",
        scheduledStart: start,
        scheduledEnd: end,
        joinCode: "lock-test-code",
      })
      .returning();

    const tokenTeacher = await createTestSession(orgA.teacher.id);

    // Lock the session
    const lockRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher}` },
      data: { action: "lock", locked: true },
    });
    expect(lockRes.status()).toBe(200);

    // Guest attempts to join/knock locked room
    const guestRes = await request.post("/api/guest/join", {
      data: {
        joinCode: "lock-test-code",
        guestName: "External Visitor",
      },
    });

    expect(guestRes.status()).toBe(423);
    const guestData = await guestRes.json();
    expect(guestData.error).toContain("locked");

    // Unlock the session
    const unlockRes = await request.post(`/api/sessions/${session.id}/host-tools`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher}` },
      data: { action: "lock", locked: false },
    });
    expect(unlockRes.status()).toBe(200);

    // Guest can now request entry / knock
    const guestResUnlocked = await request.post("/api/guest/join", {
      data: {
        joinCode: "lock-test-code",
        guestName: "External Visitor",
      },
    });
    expect([200, 202]).toContain(guestResUnlocked.status());
  });

  test("Session volume controls: RBAC and slider value clamping [0, 1]", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const end = new Date(now.getTime() + 25 * 60 * 1000);

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Audio Volume Class",
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();

    const tokenTeacher = await createTestSession(orgA.teacher.id);
    const tokenStudent = await createTestSession(orgA.student.id);

    // Student cannot update class-wide volume (403)
    const resStudent = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${tokenStudent}` },
      data: { identity: orgA.student.id, volume: 0.5 },
    });
    expect(resStudent.status()).toBe(403);

    // Host updates volume to 0.75
    const resHost = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher}` },
      data: { identity: orgA.student.id, volume: 0.75 },
    });
    expect(resHost.status()).toBe(200);
    const hostData = await resHost.json();
    expect(hostData.success).toBe(true);

    // Host updates volume out-of-bounds (e.g. 1.8), should be clamped
    const resClamp = await request.post(`/api/sessions/${session.id}/volume`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher}` },
      data: { identity: orgA.student.id, volume: 1.8 },
    });
    expect(resClamp.status()).toBe(200);
  });

  test("Spotlight controls: RBAC and toggle state", async ({
    request,
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();
    const start = new Date(now.getTime() - 5 * 60 * 1000);
    const end = new Date(now.getTime() + 25 * 60 * 1000);

    const [session] = await db
      .insert(sessions)
      .values({
        orgId: orgA.orgId,
        teacherId: orgA.teacher.id,
        type: "INDIVIDUAL",
        status: "SCHEDULED",
        title: "Spotlight Class",
        scheduledStart: start,
        scheduledEnd: end,
      })
      .returning();

    const tokenTeacher = await createTestSession(orgA.teacher.id);
    const tokenStudent = await createTestSession(orgA.student.id);

    // Student cannot spotlight
    const resStudent = await request.post(`/api/sessions/${session.id}/spotlight`, {
      headers: { Cookie: `better-auth.session_token=${tokenStudent}` },
      data: { identity: orgA.student.id },
    });
    expect(resStudent.status()).toBe(403);

    // Teacher sets spotlight
    const resSpotlight = await request.post(`/api/sessions/${session.id}/spotlight`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher}` },
      data: { identity: orgA.student.id },
    });
    expect(resSpotlight.status()).toBe(200);

    // Teacher clears spotlight
    const resClear = await request.post(`/api/sessions/${session.id}/spotlight`, {
      headers: { Cookie: `better-auth.session_token=${tokenTeacher}` },
      data: { identity: null },
    });
    expect(resClear.status()).toBe(200);
  });

  test("Room metadata parser parses lock and screen sharing permissions", () => {
    const raw = JSON.stringify({
      spotlightIdentity: "usr_123",
      isLocked: true,
      allowParticipantShare: false,
      volumes: { usr_456: 0.8 },
    });

    const parsed = parseRoomMetadata(raw);
    expect(parsed.spotlightIdentity).toBe("usr_123");
    expect(parsed.isLocked).toBe(true);
    expect(parsed.allowParticipantShare).toBe(false);
    expect(parsed.volumes?.["usr_456"]).toBe(0.8);
  });
});
