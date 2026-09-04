/**
 * @fileoverview Client- and server-safe class action state and duration helpers.
 *
 * Provides canonical meeting lifecycle state resolution, button label generation,
 * duration formatting, and countdown calculations without server-only dependencies.
 *
 * @module lib/class-action
 */

export const EARLY_JOIN_MS = 60 * 60 * 1000; // T-60
export const LATE_JOIN_MS = 3 * 60 * 60 * 1000; // T+180
export const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
export const SIBLING_WINDOW_MS = 90 * 60 * 1000; // 90 mins

export type MeetingLifecycleState =
  | "UPCOMING"
  | "READY"
  | "LIVE"
  | "EXPIRED"
  | "COMPLETED"
  | "CANCELLED";

export interface ClassActionSession {
  id: string;
  status: string;
  scheduledStart?: Date | string | null;
  scheduledEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  durationMinutes?: number | null;
  teacherId?: string | null;
  orgId?: string | null;
  title?: string | null;
  track?: string | null;
  videoRoomName?: string | null;
}

export interface ClassActionViewer {
  userId?: string;
  role?: string;
  orgId?: string;
  isTeacher?: boolean;
  isAdmin?: boolean;
}

export interface ClassActionState {
  state: MeetingLifecycleState;
  label: string;
  actionUrl: string;
  disabled: boolean;
  isHost: boolean;
  durationText: string;
  countdownText?: string;
}

function toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const parsed = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Returns canonical lifecycle state based on single-source class-room constants.
 */
export function getMeetingLifecycleState(
  session: {
    status?: string | null;
    scheduledStart?: Date | string | null;
    actualStart?: Date | string | null;
  },
  now: Date = new Date()
): MeetingLifecycleState {
  const status = session.status || "SCHEDULED";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";

  const nowMs = now.getTime();
  const actualStartDate = toDate(session.actualStart);
  const scheduledStartDate = toDate(session.scheduledStart);

  if (status === "IN_PROGRESS") {
    const startMs = actualStartDate?.getTime() ?? scheduledStartDate?.getTime() ?? nowMs;
    if (nowMs - startMs > LIVE_WINDOW_MS) {
      return "EXPIRED";
    }
    return "LIVE";
  }

  // SCHEDULED status
  const scheduledMs = scheduledStartDate?.getTime() ?? nowMs;
  if (nowMs < scheduledMs - EARLY_JOIN_MS) {
    return "UPCOMING";
  }
  if (nowMs > scheduledMs + LATE_JOIN_MS) {
    return "EXPIRED";
  }
  return "READY";
}

/**
 * Derives human-readable duration from scheduled start and end timestamps or minutes.
 * Supports both `formatClassDuration(session)` and `formatClassDuration(start, end, durationMinutes)`.
 */
export function formatClassDuration(
  startOrSession?:
    | Date
    | string
    | null
    | { scheduledStart?: Date | string | null; scheduledEnd?: Date | string | null; durationMinutes?: number | null },
  end?: Date | string | null,
  durationMinutes?: number | null
): string {
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let minutes: number | null = null;

  if (startOrSession && typeof startOrSession === "object" && !(startOrSession instanceof Date)) {
    startDate = toDate(startOrSession.scheduledStart);
    endDate = toDate(startOrSession.scheduledEnd);
    minutes = startOrSession.durationMinutes ?? null;
  } else {
    startDate = toDate(startOrSession as Date | string | null | undefined);
    endDate = toDate(end);
    minutes = durationMinutes ?? null;
  }

  if (startDate && endDate) {
    const diff = Math.round((endDate.getTime() - startDate.getTime()) / (60 * 1000));
    if (diff > 0 && !Number.isNaN(diff)) {
      minutes = diff;
    }
  }

  if (!minutes || minutes <= 0 || Number.isNaN(minutes)) {
    return "30 min";
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${rem}m`;
}

/**
 * Derives human-readable countdown to scheduled start.
 */
export function formatClassCountdown(
  scheduledStart: Date | string | null | undefined,
  now: Date = new Date()
): string {
  const startDate = toDate(scheduledStart);
  if (!startDate) return "Upcoming";

  const diffMs = startDate.getTime() - now.getTime();
  if (diffMs <= 60 * 1000) return "Class is starting now";

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `Starts in ${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (hours < 24) {
    return remMinutes > 0 ? `Starts in ${hours}h ${remMinutes}m` : `Starts in ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `In ${days} day${days > 1 ? "s" : ""}`;
}

/**
 * Derives canonical button label, disabled state, and action link for any viewer.
 *
 * Labels:
 * - UPCOMING: countdownText || "Upcoming" (disabled, neutral, actionUrl: "")
 * - READY (T-60 to T+180): "Start Class" (teacher) / "Join Class" (student) / "Observe Live" (admin)
 * - LIVE: "Rejoin Class" (teacher) / "Join Live Class" (student) / "Observe Live" (admin)
 * - Terminal: "Completed", "Cancelled", "Class Ended" (disabled, actionUrl: "")
 */
export function getClassActionState(
  session: ClassActionSession,
  viewer: ClassActionViewer,
  now: Date = new Date()
): ClassActionState {
  const state = getMeetingLifecycleState(session, now);
  const isTeacher = session.teacherId
    ? Boolean(viewer.userId && session.teacherId === viewer.userId)
    : viewer.role === "TEACHER" || viewer.isTeacher === true;
  const isAdmin =
    viewer.role === "ORG_ADMIN" ||
    viewer.role === "SUPER_ADMIN" ||
    viewer.isAdmin === true;
  const isHost = isTeacher;
  const actionUrl = `/dashboard/session/${session.id}`;
  const durationText = formatClassDuration(session);
  const countdownText = state === "UPCOMING" ? formatClassCountdown(session.scheduledStart, now) : undefined;

  if (state === "COMPLETED") {
    return { state, label: "Class Completed", actionUrl: "", disabled: true, isHost, durationText };
  }
  if (state === "CANCELLED") {
    return { state, label: "Class Cancelled", actionUrl: "", disabled: true, isHost, durationText };
  }
  if (state === "EXPIRED") {
    return { state, label: "Expired", actionUrl: "", disabled: true, isHost, durationText };
  }
  if (state === "UPCOMING") {
    return {
      state,
      label: "Upcoming",
      actionUrl: "",
      disabled: true,
      isHost,
      durationText,
      countdownText,
    };
  }

  if (state === "LIVE") {
    if (isTeacher) {
      return { state, label: "Rejoin Class", actionUrl, disabled: false, isHost: true, durationText };
    }
    if (isAdmin) {
      return { state, label: "Observe Live", actionUrl, disabled: false, isHost: false, durationText };
    }
    return { state, label: "Join Live Class", actionUrl, disabled: false, isHost: false, durationText };
  }

  // READY (within join window T-60 to T+180)
  if (isTeacher) {
    return { state, label: "Start Class", actionUrl, disabled: false, isHost: true, durationText };
  }
  if (isAdmin) {
    return { state, label: "Observe Live", actionUrl, disabled: false, isHost: false, durationText };
  }
  return { state, label: "Join Class", actionUrl, disabled: false, isHost: false, durationText };
}
