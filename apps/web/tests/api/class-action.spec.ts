import { test, expect } from "../fixtures/test";
import {
  getClassActionState,
  getMeetingLifecycleState,
  formatClassDuration,
  formatClassCountdown,
  EARLY_JOIN_MS,
  LATE_JOIN_MS,
  LIVE_WINDOW_MS,
  SIBLING_WINDOW_MS,
  SCHEDULED_BEFORE_MS,
  SCHEDULED_AFTER_MS,
  type ClassActionSession,
} from "../../src/lib/class-action";
import * as meetingConstants from "../../src/lib/meeting-constants";
import * as classRoomExports from "../../src/lib/class-room";
import * as meetingServiceExports from "../../src/lib/meeting-service";

test.describe("Phase 5: Class Action Button & Navigation Responsiveness", () => {
  const baseNow = new Date("2026-09-04T12:00:00.000Z");

  test("parity for all mirrored constants across meeting-constants, class-action, class-room, and meeting-service", () => {
    // Single source in meeting-constants
    expect(meetingConstants.EARLY_JOIN_MS).toBe(60 * 60 * 1000);
    expect(meetingConstants.LATE_JOIN_MS).toBe(3 * 60 * 60 * 1000);
    expect(meetingConstants.LIVE_WINDOW_MS).toBe(6 * 60 * 60 * 1000);
    expect(meetingConstants.SIBLING_WINDOW_MS).toBe(90 * 60 * 1000);
    expect(meetingConstants.SCHEDULED_BEFORE_MS).toBe(meetingConstants.EARLY_JOIN_MS);
    expect(meetingConstants.SCHEDULED_AFTER_MS).toBe(meetingConstants.LATE_JOIN_MS);

    // Re-exported in class-action
    expect(EARLY_JOIN_MS).toBe(meetingConstants.EARLY_JOIN_MS);
    expect(LATE_JOIN_MS).toBe(meetingConstants.LATE_JOIN_MS);
    expect(LIVE_WINDOW_MS).toBe(meetingConstants.LIVE_WINDOW_MS);
    expect(SIBLING_WINDOW_MS).toBe(meetingConstants.SIBLING_WINDOW_MS);
    expect(SCHEDULED_BEFORE_MS).toBe(meetingConstants.SCHEDULED_BEFORE_MS);
    expect(SCHEDULED_AFTER_MS).toBe(meetingConstants.SCHEDULED_AFTER_MS);

    // Re-exported in class-room
    expect(classRoomExports.EARLY_JOIN_MS).toBe(meetingConstants.EARLY_JOIN_MS);
    expect(classRoomExports.LATE_JOIN_MS).toBe(meetingConstants.LATE_JOIN_MS);
    expect(classRoomExports.LIVE_WINDOW_MS).toBe(meetingConstants.LIVE_WINDOW_MS);
    expect(classRoomExports.SIBLING_WINDOW_MS).toBe(meetingConstants.SIBLING_WINDOW_MS);
    expect(classRoomExports.SCHEDULED_BEFORE_MS).toBe(meetingConstants.SCHEDULED_BEFORE_MS);
    expect(classRoomExports.SCHEDULED_AFTER_MS).toBe(meetingConstants.SCHEDULED_AFTER_MS);

    // Re-exported in meeting-service
    expect(meetingServiceExports.EARLY_JOIN_MS).toBe(meetingConstants.EARLY_JOIN_MS);
    expect(meetingServiceExports.LATE_JOIN_MS).toBe(meetingConstants.LATE_JOIN_MS);
    expect(meetingServiceExports.LIVE_WINDOW_MS).toBe(meetingConstants.LIVE_WINDOW_MS);
    expect(meetingServiceExports.SIBLING_WINDOW_MS).toBe(meetingConstants.SIBLING_WINDOW_MS);
    expect(meetingServiceExports.SCHEDULED_BEFORE_MS).toBe(meetingConstants.SCHEDULED_BEFORE_MS);
    expect(meetingServiceExports.SCHEDULED_AFTER_MS).toBe(meetingConstants.SCHEDULED_AFTER_MS);

    // Functions re-exported in meeting-service
    expect(typeof meetingServiceExports.getClassActionState).toBe("function");
    expect(typeof meetingServiceExports.getMeetingLifecycleState).toBe("function");
    expect(typeof meetingServiceExports.formatClassDuration).toBe("function");
    expect(typeof meetingServiceExports.formatClassCountdown).toBe("function");
  });

  test("duration formatting handles range, minutes, and defaults correctly", () => {
    // 1. Start and End provided (45 minutes)
    const d1 = formatClassDuration({
      scheduledStart: new Date("2026-09-04T12:00:00Z"),
      scheduledEnd: new Date("2026-09-04T12:45:00Z"),
    });
    expect(d1).toBe("45 min");

    // 2. Start and End provided (1 hour 15 minutes)
    const d2 = formatClassDuration({
      scheduledStart: new Date("2026-09-04T12:00:00Z"),
      scheduledEnd: new Date("2026-09-04T13:15:00Z"),
    });
    expect(d2).toBe("1h 15m");

    // 3. durationMinutes provided
    const d3 = formatClassDuration({
      durationMinutes: 60,
    });
    expect(d3).toBe("1h");

    // 4. Default fallback when no end or minutes
    const d4 = formatClassDuration({});
    expect(d4).toBe("30 min");
  });

  test("countdown calculation provides human readable time before class", () => {
    // 2 hours 15 mins away
    const tFuture = new Date(baseNow.getTime() + (2 * 60 + 15) * 60 * 1000);
    expect(formatClassCountdown(tFuture, baseNow)).toBe("Starts in 2h 15m");

    // 45 mins away
    const t45m = new Date(baseNow.getTime() + 45 * 60 * 1000);
    expect(formatClassCountdown(t45m, baseNow)).toBe("Starts in 45m");

    // Imminent (< 1 minute away)
    const tSoon = new Date(baseNow.getTime() + 30 * 1000);
    expect(formatClassCountdown(tSoon, baseNow)).toBe("Class is starting now");

    // Past start
    const tPast = new Date(baseNow.getTime() - 5 * 60 * 1000);
    expect(formatClassCountdown(tPast, baseNow)).toBe("Class is starting now");
  });

  test("T-60 boundary: No blue action before T-60 (UPCOMING), blue action at and within T-60 (READY)", () => {
    const sessionId = "sess-boundary-1";

    // Case 1: T-61 minutes -> UPCOMING
    const startT61 = new Date(baseNow.getTime() + 61 * 60 * 1000);
    const sessionT61: ClassActionSession = {
      id: sessionId,
      status: "SCHEDULED",
      scheduledStart: startT61,
    };

    const studentActionT61 = getClassActionState(sessionT61, { role: "STUDENT" }, baseNow);
    expect(studentActionT61.state).toBe("UPCOMING");
    expect(studentActionT61.disabled).toBe(true);
    expect(studentActionT61.actionUrl).toBe(""); // Zero dead navigation
    expect(studentActionT61.countdownText).toContain("Starts in 1h 1m");

    const teacherActionT61 = getClassActionState(sessionT61, { role: "TEACHER", isTeacher: true }, baseNow);
    expect(teacherActionT61.state).toBe("UPCOMING");
    expect(teacherActionT61.disabled).toBe(true);
    expect(teacherActionT61.actionUrl).toBe("");

    // Case 2: Exactly T-60 minutes -> READY (Action button activates)
    const startT60 = new Date(baseNow.getTime() + EARLY_JOIN_MS);
    const sessionT60: ClassActionSession = {
      id: sessionId,
      status: "SCHEDULED",
      scheduledStart: startT60,
    };

    const studentActionT60 = getClassActionState(sessionT60, { role: "STUDENT" }, baseNow);
    expect(studentActionT60.state).toBe("READY");
    expect(studentActionT60.disabled).toBe(false);
    expect(studentActionT60.actionUrl).toBe(`/dashboard/session/${sessionId}`);
    expect(studentActionT60.label).toBe("Join Class");

    const teacherActionT60 = getClassActionState(sessionT60, { role: "TEACHER", isTeacher: true }, baseNow);
    expect(teacherActionT60.state).toBe("READY");
    expect(teacherActionT60.disabled).toBe(false);
    expect(teacherActionT60.actionUrl).toBe(`/dashboard/session/${sessionId}`);
    expect(teacherActionT60.label).toBe("Start Class");

    const adminActionT60 = getClassActionState(sessionT60, { role: "ORG_ADMIN", isAdmin: true }, baseNow);
    expect(adminActionT60.state).toBe("READY");
    expect(adminActionT60.disabled).toBe(false);
    expect(adminActionT60.actionUrl).toBe(`/dashboard/session/${sessionId}`);
    expect(adminActionT60.label).toBe("Observe Live");
  });

  test("LIVE state correctly identifies active classes and displays role-specific rejoining actions", () => {
    const sessionId = "sess-live-1";

    const sessionLive: ClassActionSession = {
      id: sessionId,
      status: "IN_PROGRESS",
      scheduledStart: new Date(baseNow.getTime() - 10 * 60 * 1000),
      actualStart: new Date(baseNow.getTime() - 8 * 60 * 1000),
    };

    // Teacher -> Rejoin Class
    const teacherState = getClassActionState(sessionLive, { role: "TEACHER", isTeacher: true }, baseNow);
    expect(teacherState.state).toBe("LIVE");
    expect(teacherState.label).toBe("Rejoin Class");
    expect(teacherState.disabled).toBe(false);
    expect(teacherState.actionUrl).toBe(`/dashboard/session/${sessionId}`);

    // Student -> Join Live Class
    const studentState = getClassActionState(sessionLive, { role: "STUDENT" }, baseNow);
    expect(studentState.state).toBe("LIVE");
    expect(studentState.label).toBe("Join Live Class");
    expect(studentState.disabled).toBe(false);
    expect(studentState.actionUrl).toBe(`/dashboard/session/${sessionId}`);

    // Admin/Observer -> Observe Live
    const adminState = getClassActionState(sessionLive, { role: "SUPER_ADMIN", isAdmin: true }, baseNow);
    expect(adminState.state).toBe("LIVE");
    expect(adminState.label).toBe("Observe Live");
    expect(adminState.disabled).toBe(false);
    expect(adminState.actionUrl).toBe(`/dashboard/session/${sessionId}`);
  });

  test("terminal states prevent dead navigation: COMPLETED, CANCELLED, EXPIRED", () => {
    const sessionId = "sess-terminal-1";

    // 1. COMPLETED session
    const completedSession: ClassActionSession = {
      id: sessionId,
      status: "COMPLETED",
      actualStart: new Date(baseNow.getTime() - 60 * 60 * 1000),
      actualEnd: new Date(baseNow.getTime() - 15 * 60 * 1000),
    };
    const completedState = getClassActionState(completedSession, { role: "STUDENT" }, baseNow);
    expect(completedState.state).toBe("COMPLETED");
    expect(completedState.disabled).toBe(true);
    expect(completedState.actionUrl).toBe("");
    expect(completedState.label).toBe("Class Completed");

    // 2. CANCELLED session
    const cancelledSession: ClassActionSession = {
      id: sessionId,
      status: "CANCELLED",
    };
    const cancelledState = getClassActionState(cancelledSession, { role: "TEACHER" }, baseNow);
    expect(cancelledState.state).toBe("CANCELLED");
    expect(cancelledState.disabled).toBe(true);
    expect(cancelledState.actionUrl).toBe("");
    expect(cancelledState.label).toBe("Class Cancelled");

    // 3. EXPIRED session (scheduled in past, never started, past late join window)
    const expiredSession: ClassActionSession = {
      id: sessionId,
      status: "SCHEDULED",
      scheduledStart: new Date(baseNow.getTime() - (LATE_JOIN_MS + 5 * 60 * 1000)),
      scheduledEnd: new Date(baseNow.getTime() - (LATE_JOIN_MS + 2 * 60 * 1000)),
    };
    const expiredState = getClassActionState(expiredSession, { role: "STUDENT" }, baseNow);
    expect(expiredState.state).toBe("EXPIRED");
    expect(expiredState.disabled).toBe(true);
    expect(expiredState.actionUrl).toBe("");
    expect(expiredState.label).toBe("Expired");
  });

  test("schedule UPCOMING-no-URL: UPCOMING sessions never link to the room and remain disabled", () => {
    const futureTimes = [
      new Date(baseNow.getTime() + 65 * 60 * 1000), // T-65
      new Date(baseNow.getTime() + 120 * 60 * 1000), // T-120
      new Date(baseNow.getTime() + 24 * 60 * 60 * 1000), // Tomorrow
    ];

    for (const scheduledStart of futureTimes) {
      const session: ClassActionSession = {
        id: "sess-future",
        status: "SCHEDULED",
        scheduledStart,
      };

      // Student viewer
      const studentState = getClassActionState(session, { role: "STUDENT" }, baseNow);
      expect(studentState.state).toBe("UPCOMING");
      expect(studentState.disabled).toBe(true);
      expect(studentState.actionUrl).toBe(""); // Zero dead navigation
      expect(studentState.countdownText).toBeTruthy();

      // Teacher viewer
      const teacherState = getClassActionState(session, { role: "TEACHER", isTeacher: true }, baseNow);
      expect(teacherState.state).toBe("UPCOMING");
      expect(teacherState.disabled).toBe(true);
      expect(teacherState.actionUrl).toBe("");

      // Admin viewer
      const adminState = getClassActionState(session, { role: "ORG_ADMIN", isAdmin: true }, baseNow);
      expect(adminState.state).toBe("UPCOMING");
      expect(adminState.disabled).toBe(true);
      expect(adminState.actionUrl).toBe("");
    }
  });

  test("IN_PROGRESS -> LIVE via helper: active session resolves to LIVE within 6h, EXPIRED past 6h", () => {
    const sessionId = "sess-in-progress-1";

    // Case 1: Session started 1 hour ago (within 6h LIVE window)
    const active1h: ClassActionSession = {
      id: sessionId,
      status: "IN_PROGRESS",
      actualStart: new Date(baseNow.getTime() - 60 * 60 * 1000),
    };
    expect(getMeetingLifecycleState(active1h, baseNow)).toBe("LIVE");
    const activeState = getClassActionState(active1h, { role: "STUDENT" }, baseNow);
    expect(activeState.state).toBe("LIVE");
    expect(activeState.disabled).toBe(false);
    expect(activeState.actionUrl).toBe(`/dashboard/session/${sessionId}`);
    expect(activeState.label).toBe("Join Live Class");

    // Case 2: Session marked IN_PROGRESS but started 6h 15m ago (past 6h LIVE window)
    const stale6h: ClassActionSession = {
      id: sessionId,
      status: "IN_PROGRESS",
      actualStart: new Date(baseNow.getTime() - (LIVE_WINDOW_MS + 15 * 60 * 1000)),
    };
    expect(getMeetingLifecycleState(stale6h, baseNow)).toBe("EXPIRED");
    const staleState = getClassActionState(stale6h, { role: "STUDENT" }, baseNow);
    expect(staleState.state).toBe("EXPIRED");
    expect(staleState.disabled).toBe(true);
    expect(staleState.actionUrl).toBe("");
    expect(staleState.label).toBe("Expired");
  });

  test("unrelated-teacher non-host label: unrelated teachers in same org see Join Class, not Start Class", () => {
    const sessionId = "sess-teacher-assigned";
    const assignedTeacherId = "teacher-alice";
    const unrelatedTeacherId = "teacher-bob";
    const adminId = "admin-carol";

    // 1. READY Window (T-30 min)
    const readySession: ClassActionSession = {
      id: sessionId,
      status: "SCHEDULED",
      teacherId: assignedTeacherId,
      scheduledStart: new Date(baseNow.getTime() + 30 * 60 * 1000),
    };

    // Assigned teacher -> Start Class, isHost: true
    const assignedReady = getClassActionState(
      readySession,
      { userId: assignedTeacherId, role: "TEACHER" },
      baseNow
    );
    expect(assignedReady.isHost).toBe(true);
    expect(assignedReady.label).toBe("Start Class");
    expect(assignedReady.disabled).toBe(false);
    expect(assignedReady.actionUrl).toBe(`/dashboard/session/${sessionId}`);

    // Unrelated teacher -> Join Class, isHost: false (Phase 1 / Phase 5 non-host guarantee)
    const unrelatedReady = getClassActionState(
      readySession,
      { userId: unrelatedTeacherId, role: "TEACHER" },
      baseNow
    );
    expect(unrelatedReady.isHost).toBe(false);
    expect(unrelatedReady.label).toBe("Join Class");
    expect(unrelatedReady.disabled).toBe(false);
    expect(unrelatedReady.actionUrl).toBe(`/dashboard/session/${sessionId}`);

    // Admin observer -> Observe Live, isHost: false
    const adminReady = getClassActionState(
      readySession,
      { userId: adminId, role: "ORG_ADMIN", isAdmin: true },
      baseNow
    );
    expect(adminReady.isHost).toBe(false);
    expect(adminReady.label).toBe("Observe Live");

    // 2. LIVE Window
    const liveSession: ClassActionSession = {
      id: sessionId,
      status: "IN_PROGRESS",
      teacherId: assignedTeacherId,
      actualStart: new Date(baseNow.getTime() - 10 * 60 * 1000),
    };

    // Assigned teacher -> Rejoin Class, isHost: true
    const assignedLive = getClassActionState(
      liveSession,
      { userId: assignedTeacherId, role: "TEACHER" },
      baseNow
    );
    expect(assignedLive.isHost).toBe(true);
    expect(assignedLive.label).toBe("Rejoin Class");

    // Unrelated teacher -> Join Live Class, isHost: false
    const unrelatedLive = getClassActionState(
      liveSession,
      { userId: unrelatedTeacherId, role: "TEACHER" },
      baseNow
    );
    expect(unrelatedLive.isHost).toBe(false);
    expect(unrelatedLive.label).toBe("Join Live Class");

    // Admin observer -> Observe Live, isHost: false
    const adminLive = getClassActionState(
      liveSession,
      { userId: adminId, role: "ORG_ADMIN", isAdmin: true },
      baseNow
    );
    expect(adminLive.isHost).toBe(false);
    expect(adminLive.label).toBe("Observe Live");
  });
});
