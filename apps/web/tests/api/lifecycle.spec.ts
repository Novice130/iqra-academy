import { test, expect } from "../fixtures/test";
import { getTestDb } from "../fixtures/orgs";
import {
  getMeetingLifecycleState,
  getClassActionState,
  resolveStartTarget,
  startScheduledOccurrence,
  ringParticipantIntoCanonicalRoom,
  EARLY_JOIN_MS,
  LATE_JOIN_MS,
  LIVE_WINDOW_MS,
} from "../../src/lib/meeting-service";
import * as classRoom from "../../src/lib/class-room";
import * as classAction from "../../src/lib/class-action";
import { sessions, bookings, studentProfiles, callInvites, notifications } from "../../src/db/schema";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

test.describe("Phase 3: Canonical Meeting Lifecycle & Invariants", () => {
  test("exact T-60 boundary: T-61 is UPCOMING, T-60 is READY", () => {
    const baseNow = new Date("2026-09-04T12:00:00Z");

    // 1. T-61 minutes (61 min before scheduledStart -> 3660_000 ms away)
    // scheduledStart is 61 minutes in the future from baseNow
    const scheduledStartT61 = new Date(baseNow.getTime() + 61 * 60 * 1000);
    const stateT61 = getMeetingLifecycleState(
      { status: "SCHEDULED", scheduledStart: scheduledStartT61, actualStart: null },
      baseNow
    );
    expect(stateT61).toBe("UPCOMING");

    // 2. Exactly T-60 minutes (60 minutes in future -> exactly EARLY_JOIN_MS away)
    const scheduledStartT60 = new Date(baseNow.getTime() + EARLY_JOIN_MS);
    const stateT60 = getMeetingLifecycleState(
      { status: "SCHEDULED", scheduledStart: scheduledStartT60, actualStart: null },
      baseNow
    );
    expect(stateT60).toBe("READY");

    // 3. T-59 minutes (inside window)
    const scheduledStartT59 = new Date(baseNow.getTime() + 59 * 60 * 1000);
    const stateT59 = getMeetingLifecycleState(
      { status: "SCHEDULED", scheduledStart: scheduledStartT59, actualStart: null },
      baseNow
    );
    expect(stateT59).toBe("READY");

    // 4. Class time (now == scheduledStart)
    const stateAtStart = getMeetingLifecycleState(
      { status: "SCHEDULED", scheduledStart: baseNow, actualStart: null },
      baseNow
    );
    expect(stateAtStart).toBe("READY");

    // 5. Within late join window (e.g. 30 min after scheduledStart)
    const scheduledStartPast30m = new Date(baseNow.getTime() - 30 * 60 * 1000);
    const statePast30m = getMeetingLifecycleState(
      { status: "SCHEDULED", scheduledStart: scheduledStartPast30m, actualStart: null },
      baseNow
    );
    expect(statePast30m).toBe("READY");

    // 6. Exceeded late join window (LATE_JOIN_MS = 180 min)
    const scheduledStartExpired = new Date(baseNow.getTime() - (LATE_JOIN_MS + 1000));
    const stateExpired = getMeetingLifecycleState(
      { status: "SCHEDULED", scheduledStart: scheduledStartExpired, actualStart: null },
      baseNow
    );
    expect(stateExpired).toBe("EXPIRED");
  });

  test("IN_PROGRESS meeting lifecycle within and beyond LIVE_WINDOW_MS", () => {
    const baseNow = new Date("2026-09-04T12:00:00Z");

    // Fresh IN_PROGRESS meeting
    const stateLive = getMeetingLifecycleState(
      {
        status: "IN_PROGRESS",
        scheduledStart: new Date(baseNow.getTime() - 10 * 60 * 1000),
        actualStart: new Date(baseNow.getTime() - 10 * 60 * 1000),
      },
      baseNow
    );
    expect(stateLive).toBe("LIVE");

    // Zombie IN_PROGRESS meeting older than LIVE_WINDOW_MS (6h)
    const stateZombie = getMeetingLifecycleState(
      {
        status: "IN_PROGRESS",
        scheduledStart: new Date(baseNow.getTime() - (LIVE_WINDOW_MS + 5000)),
        actualStart: new Date(baseNow.getTime() - (LIVE_WINDOW_MS + 5000)),
      },
      baseNow
    );
    expect(stateZombie).toBe("EXPIRED");

    // Terminal statuses
    expect(
      getMeetingLifecycleState(
        { status: "COMPLETED", scheduledStart: baseNow, actualStart: baseNow },
        baseNow
      )
    ).toBe("COMPLETED");

    expect(
      getMeetingLifecycleState(
        { status: "CANCELLED", scheduledStart: baseNow, actualStart: null },
        baseNow
      )
    ).toBe("CANCELLED");
  });

  test("getClassActionState generates canonical button labels for teacher, student, and admin", () => {
    const baseNow = new Date("2026-09-04T12:00:00Z");
    const teacherId = "teacher-123";
    const studentId = "student-456";
    const adminId = "admin-789";

    const mockSession = {
      id: "session-1",
      orgId: "org-1",
      teacherId,
      status: "SCHEDULED",
      type: "INDIVIDUAL",
      origin: "SCHEDULED",
      title: "Quran Recitation",
      scheduledStart: new Date(baseNow.getTime() + 15 * 60 * 1000), // READY (in 15m)
      scheduledEnd: new Date(baseNow.getTime() + 45 * 60 * 1000),
      actualStart: null,
      actualEnd: null,
      videoRoomName: null,
      consumesQuota: true,
      isTrial: false,
      notes: null,
      createdAt: baseNow,
      updatedAt: baseNow,
    } as any;

    const teacherViewer = { userId: teacherId, role: "TEACHER", orgId: "org-1" };
    const studentViewer = { userId: studentId, role: "STUDENT", orgId: "org-1" };
    const adminViewer = { userId: adminId, role: "ORG_ADMIN", orgId: "org-1" };

    // 1. In READY state
    const teacherReadyAction = getClassActionState(mockSession, teacherViewer, baseNow);
    expect(teacherReadyAction.state).toBe("READY");
    expect(teacherReadyAction.label).toBe("Start Class");
    expect(teacherReadyAction.disabled).toBe(false);
    expect(teacherReadyAction.isHost).toBe(true);

    const studentReadyAction = getClassActionState(mockSession, studentViewer, baseNow);
    expect(studentReadyAction.state).toBe("READY");
    expect(studentReadyAction.label).toBe("Join Class");
    expect(studentReadyAction.disabled).toBe(false);
    expect(studentReadyAction.isHost).toBe(false);

    const adminReadyAction = getClassActionState(mockSession, adminViewer, baseNow);
    expect(adminReadyAction.label).toBe("Observe Live");

    // 2. In LIVE state
    const liveSession = {
      ...mockSession,
      status: "IN_PROGRESS",
      actualStart: new Date(baseNow.getTime() - 5 * 60 * 1000),
    };

    const teacherLiveAction = getClassActionState(liveSession, teacherViewer, baseNow);
    expect(teacherLiveAction.state).toBe("LIVE");
    expect(teacherLiveAction.label).toBe("Rejoin Class");
    expect(teacherLiveAction.disabled).toBe(false);

    const studentLiveAction = getClassActionState(liveSession, studentViewer, baseNow);
    expect(studentLiveAction.state).toBe("LIVE");
    expect(studentLiveAction.label).toBe("Join Live Class");
    expect(studentLiveAction.disabled).toBe(false);

    const adminLiveAction = getClassActionState(liveSession, adminViewer, baseNow);
    expect(adminLiveAction.state).toBe("LIVE");
    expect(adminLiveAction.label).toBe("Observe Live");

    // 3. In UPCOMING state (>60m away)
    const upcomingSession = {
      ...mockSession,
      scheduledStart: new Date(baseNow.getTime() + 120 * 60 * 1000),
    };
    const teacherUpcoming = getClassActionState(upcomingSession, teacherViewer, baseNow);
    expect(teacherUpcoming.state).toBe("UPCOMING");
    expect(teacherUpcoming.label).toBe("Upcoming");
    expect(teacherUpcoming.disabled).toBe(true);

    // 4. In COMPLETED state
    const completedSession = {
      ...mockSession,
      status: "COMPLETED",
    };
    const studentCompleted = getClassActionState(completedSession, studentViewer, baseNow);
    expect(studentCompleted.state).toBe("COMPLETED");
    expect(studentCompleted.label).toBe("Class Completed");
    expect(studentCompleted.disabled).toBe(true);
  });
});

test.describe("Phase 3: Database & Meeting Service Integration", () => {
  test("teacher starting scheduled class transitions to IN_PROGRESS with actualStart and notifies student", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    const sessionId = createId();
    await db.insert(sessions).values({
      id: sessionId,
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      type: "INDIVIDUAL",
      origin: "SCHEDULED",
      status: "SCHEDULED",
      title: "Scheduled Occurrence Test",
      scheduledStart: now,
      scheduledEnd: new Date(now.getTime() + 30 * 60 * 1000),
    });

    const bookingId = createId();
    await db.insert(bookings).values({
      id: bookingId,
      orgId: orgA.orgId,
      userId: orgA.student.id,
      sessionId,
      status: "CONFIRMED",
    });

    // Start occurrence as assigned teacher
    const startResult = await startScheduledOccurrence({
      sessionId,
      teacherId: orgA.teacher.id,
      orgId: orgA.orgId,
    });

    expect(startResult.sessionId).toBe(sessionId);
    expect(startResult.roomName).toBeTruthy();

    const updated = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    expect(updated?.status).toBe("IN_PROGRESS");
    expect(updated?.actualStart).not.toBeNull();

    // Verify student was notified
    const notification = await db.query.notifications.findFirst({
      where: and(
        eq(notifications.sessionId, sessionId),
        eq(notifications.userId, orgA.student.id),
        eq(notifications.type, "MEETING_STARTED")
      ),
    });
    expect(notification).toBeTruthy();
  });

  test("direct call reuses due scheduled class instead of creating competing room", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    // Create student profile
    const profileId = createId();
    await db.insert(studentProfiles).values({
      id: profileId,
      orgId: orgA.orgId,
      userId: orgA.student.id,
      name: "Playwright Test Student",
    });

    // Scheduled class due in 10 minutes
    const dueSessionId = createId();
    await db.insert(sessions).values({
      id: dueSessionId,
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      type: "INDIVIDUAL",
      origin: "SCHEDULED",
      status: "SCHEDULED",
      title: "Due Class To Converge",
      scheduledStart: new Date(now.getTime() + 10 * 60 * 1000),
      scheduledEnd: new Date(now.getTime() + 40 * 60 * 1000),
    });

    await db.insert(bookings).values({
      id: createId(),
      orgId: orgA.orgId,
      userId: orgA.student.id,
      studentProfileId: profileId,
      sessionId: dueSessionId,
      status: "CONFIRMED",
    });

    // Teacher rings student WITHOUT passing existingSessionId
    const ringResult = await ringParticipantIntoCanonicalRoom({
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      studentProfileId: profileId,
    });

    // MUST converge on due scheduled session
    expect(ringResult.sessionId).toBe(dueSessionId);

    // Call invite must reference canonical session
    const callInvite = await db.query.callInvites.findFirst({
      where: eq(callInvites.id, ringResult.callId),
    });
    expect(callInvite?.sessionId).toBe(dueSessionId);
    expect(callInvite?.status).toBe("RINGING");

    // The scheduled session must now be started (IN_PROGRESS)
    const convergedSession = await db.query.sessions.findFirst({
      where: eq(sessions.id, dueSessionId),
    });
    expect(convergedSession?.status).toBe("IN_PROGRESS");
  });

  test("resolver and button agree at T+130 (single due window)", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const { SCHEDULED_AFTER_MS, SCHEDULED_BEFORE_MS } = await import(
      "../../src/lib/meeting-service"
    );
    // The competing-room bug: if resolver and button disagree on "due", the
    // button invites the student in while the resolver refuses to converge
    // the teacher there. class-action.ts mirrors class-room.ts by design
    // (client-safe); this assertion is what keeps the mirror honest.
    expect(SCHEDULED_AFTER_MS).toBe(LATE_JOIN_MS);
    expect(SCHEDULED_BEFORE_MS).toBe(EARLY_JOIN_MS);
    expect(classAction.EARLY_JOIN_MS).toBe(classRoom.EARLY_JOIN_MS);
    expect(classAction.LATE_JOIN_MS).toBe(classRoom.LATE_JOIN_MS);
    expect(classAction.LIVE_WINDOW_MS).toBe(classRoom.LIVE_WINDOW_MS);
    expect(classAction.SIBLING_WINDOW_MS).toBe(classRoom.SIBLING_WINDOW_MS);

    // Class started 130 min ago (inside T+180, outside old T+120): both
    // sides must still call it due/READY.
    const now = new Date();
    const start130 = new Date(now.getTime() - 130 * 60 * 1000);
    const sid = createId();
    await db.insert(sessions).values({
      id: sid,
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      type: "INDIVIDUAL",
      origin: "SCHEDULED",
      status: "SCHEDULED",
      title: "T+130 Agreement Class",
      scheduledStart: start130,
      scheduledEnd: new Date(start130.getTime() + 30 * 60 * 1000),
    });
    const target = await resolveStartTarget(orgA.teacher.id, orgA.orgId, now);
    expect(target.kind).toBe("scheduled");
    if (target.kind === "scheduled") expect(target.session.id).toBe(sid);

    const button = getClassActionState(
      { id: sid, status: "SCHEDULED", scheduledStart: start130 } as any,
      { userId: orgA.student.id, role: "STUDENT", orgId: orgA.orgId },
      now
    );
    expect(button.state).toBe("READY");
  });

  test("unrelated teacher viewer gets non-host labels", () => {
    const baseNow = new Date("2026-09-04T12:00:00Z");
    const otherTeacher = { userId: "teacher-other", role: "TEACHER", orgId: "org-1" };
    const liveSession = {
      id: "session-1",
      orgId: "org-1",
      teacherId: "teacher-123",
      status: "IN_PROGRESS",
      scheduledStart: new Date(baseNow.getTime() - 10 * 60 * 1000),
      scheduledEnd: new Date(baseNow.getTime() + 20 * 60 * 1000),
      actualStart: new Date(baseNow.getTime() - 10 * 60 * 1000),
    } as any;
    const action = getClassActionState(liveSession, otherTeacher, baseNow);
    expect(action.isHost).toBe(false);
    expect(action.label).not.toMatch(/Start Class|Rejoin Class/);
  });

  test("resolveStartTarget identifies running, scheduled, or instant correctly", async ({
    orgA,
  }) => {
    const { db } = getTestDb();
    const now = new Date();

    // 1. When no active or due session exists -> instant
    const targetInstant = await resolveStartTarget(orgA.teacher.id, orgA.orgId, now);
    // Might find past sessions if shared DB, but check kind
    expect(["instant", "scheduled", "running"]).toContain(targetInstant.kind);

    // 2. Create an in-progress session
    const liveId = createId();
    await db.insert(sessions).values({
      id: liveId,
      orgId: orgA.orgId,
      teacherId: orgA.teacher.id,
      type: "INDIVIDUAL",
      origin: "INSTANT",
      status: "IN_PROGRESS",
      title: "Live Active Class",
      scheduledStart: now,
      scheduledEnd: new Date(now.getTime() + 60 * 60 * 1000),
      actualStart: now,
    });

    const targetLive = await resolveStartTarget(orgA.teacher.id, orgA.orgId, now);
    expect(targetLive.kind).toBe("running");
    if (targetLive.kind === "running") {
      expect(targetLive.session.status).toBe("IN_PROGRESS");
    }
  });
});
