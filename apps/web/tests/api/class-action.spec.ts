import { test, expect } from "../fixtures/test";
import {
  getClassActionState,
  formatClassDuration,
  formatClassCountdown,
  EARLY_JOIN_MS,
  LATE_JOIN_MS,
  LIVE_WINDOW_MS,
  type ClassActionSession,
} from "../../src/lib/class-action";
import * as meetingServiceExports from "../../src/lib/meeting-service";

test.describe("Phase 5: Class Action Button & Navigation Responsiveness", () => {
  const baseNow = new Date("2026-09-04T12:00:00.000Z");

  test("pure class-action exports are re-exported by meeting-service for backward compatibility", () => {
    expect(typeof meetingServiceExports.getClassActionState).toBe("function");
    expect(typeof meetingServiceExports.getMeetingLifecycleState).toBe("function");
    expect(typeof meetingServiceExports.formatClassDuration).toBe("function");
    expect(typeof meetingServiceExports.formatClassCountdown).toBe("function");
    expect(meetingServiceExports.EARLY_JOIN_MS).toBe(EARLY_JOIN_MS);
    expect(meetingServiceExports.LATE_JOIN_MS).toBe(LATE_JOIN_MS);
    expect(meetingServiceExports.LIVE_WINDOW_MS).toBe(LIVE_WINDOW_MS);
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
});
