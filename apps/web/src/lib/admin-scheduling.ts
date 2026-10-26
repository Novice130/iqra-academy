/**
 * @fileoverview Changing a class after it was booked — cancel, reschedule,
 * reassign, and recording how it went (completed / no-show).
 *
 * WHY THIS EXISTS: PATCH /api/sessions/[id] used to write whatever it was
 * given. Cancelling told nobody (while the admin dialog promised families
 * would be told), a new time or teacher was written with no conflict or
 * time-off check, and the teacherId in the body was never checked against the
 * session's org. Every rule for "may this class change, and who hears about
 * it" now lives here, so the PATCH route (teachers and admins) and the
 * assign-student route apply the same ones.
 *
 * ORDER OF WORK, and why:
 *   1. Validate everything first — a refused change writes nothing.
 *   2. One transaction: the session row, its bookings and the realtime outbox
 *      events commit together, so a live dashboard never sees half a change.
 *   3. After commit: audit, LiveKit room clean-up, then notifications deferred
 *      past the response. Email and push are network calls; holding a
 *      transaction open across them is how a pool runs dry.
 *
 * Bookings are left alone when a class is marked COMPLETED or NO_SHOW: quota
 * (lib/quota.ts) counts CONFIRMED and COMPLETED bookings, and whether a
 * student's no-show still uses their lesson is a billing policy, not
 * something an attendance correction should decide by accident.
 *
 * @module lib/admin-scheduling
 */

import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessions, studentProfiles, teacherTimeOff, users } from "@/db/schema";
import { AppError, BusinessRuleError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { assertTeacherInOrg } from "@/lib/session-access";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { logAudit, type AuditAction } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { closeAttendanceRows } from "@/lib/attendance";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";
import { wallClockRoundTrips, zonedWallClockToInstant } from "@/lib/slots";
import { isValidZone } from "@/lib/zones";
import type { UserRole } from "@/lib/rbac";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pool or an open transaction — conflict checks run in both. */
export type DbExecutor = Db | Tx;

// ─── Time input ─────────────────────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * The instant a wall-clock reading names in a zone, e.g. ("2026-11-02",
 * "17:30", "America/Chicago").
 *
 * Forms send the reading plus the zone it was typed in rather than an ISO
 * instant, because the browser's own `new Date("…T17:30")` uses the device
 * zone — which is not the viewer zone whenever the account sets one. A time
 * that does not exist (the spring-forward hour) is refused rather than
 * silently moved an hour.
 */
export function wallClockToInstant(date: string, time: string, zone: string): Date {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) throw new AppError("Date must be YYYY-MM-DD and time HH:mm.", 400, "BAD_REQUEST");
  if (!isValidZone(zone)) throw new AppError(`Unknown time zone "${zone}".`, 400, "BAD_REQUEST");
  const [hh, mm] = [Number(t[1]), Number(t[2])];
  if (hh > 23 || mm > 59) throw new AppError("Time must be between 00:00 and 23:59.", 400, "BAD_REQUEST");
  const instant = zonedWallClockToInstant(Number(d[1]), Number(d[2]), Number(d[3]), hh, mm, zone);
  if (Number.isNaN(instant.getTime())) throw new AppError("That date is not valid.", 400, "BAD_REQUEST");
  if (!wallClockRoundTrips(instant, zone, hh, mm)) {
    throw new BusinessRuleError(`${time} does not exist on ${date} in ${zone} (the clocks change that night).`);
  }
  return instant;
}

/** "2026-11-02" plus n days, as a calendar date (no zone involved). */
export function addDaysToDateKey(date: string, days: number): string {
  const d = DATE_RE.exec(date);
  if (!d) return date;
  const utc = new Date(Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]) + days));
  return utc.toISOString().slice(0, 10);
}

/** A short "Mon, Nov 2, 5:30 PM CST" in the recipient's own zone. */
function formatFor(instant: Date, zone: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: zone && isValidZone(zone) ? zone : "UTC",
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    }).format(instant);
  } catch {
    return instant.toISOString();
  }
}

// ─── Conflicts ──────────────────────────────────────────────────────────────

/**
 * Why a teacher (and optionally some students) cannot take a class at
 * [start, end), or null when they can. Org is in every WHERE: the ids passed
 * in are org-checked by the caller, but the check must not depend on that.
 */
export async function findScheduleConflict(
  exec: DbExecutor,
  opts: {
    orgId: string;
    teacherId: string;
    start: Date;
    end: Date;
    /** The session being moved — it cannot conflict with itself. */
    excludeSessionId?: string;
    studentProfileIds?: string[];
  }
): Promise<string | null> {
  const notSelf = opts.excludeSessionId ? [ne(sessions.id, opts.excludeSessionId)] : [];

  const [clash] = await exec
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        eq(sessions.teacherId, opts.teacherId),
        eq(sessions.orgId, opts.orgId),
        inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
        lt(sessions.scheduledStart, opts.end),
        gt(sessions.scheduledEnd, opts.start),
        ...notSelf
      )
    )
    .limit(1);
  if (clash) return "Teacher already has a scheduled class during this time.";

  const [off] = await exec
    .select({ id: teacherTimeOff.id })
    .from(teacherTimeOff)
    .where(
      and(
        eq(teacherTimeOff.teacherId, opts.teacherId),
        eq(teacherTimeOff.orgId, opts.orgId),
        lt(teacherTimeOff.startsAt, opts.end),
        gt(teacherTimeOff.endsAt, opts.start)
      )
    )
    .limit(1);
  if (off) return "Teacher has scheduled time off during this time.";

  if (opts.studentProfileIds && opts.studentProfileIds.length > 0) {
    const [busy] = await exec
      .select({ name: studentProfiles.name })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .innerJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
      .where(
        and(
          inArray(bookings.studentProfileId, opts.studentProfileIds),
          ne(bookings.status, "CANCELLED"),
          eq(sessions.orgId, opts.orgId),
          inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
          lt(sessions.scheduledStart, opts.end),
          gt(sessions.scheduledEnd, opts.start),
          ...notSelf
        )
      )
      .limit(1);
    if (busy) return `${busy.name} already has a class during this time.`;
  }

  return null;
}

// ─── Updating a session ─────────────────────────────────────────────────────

export interface SchedulingActor {
  userId: string;
  orgId: string;
  role: UserRole;
  ipAddress?: string;
}

export type SessionStatus = "SCHEDULED" | "IN_PROGRESS" | "CANCELLED" | "COMPLETED" | "NO_SHOW";

export interface SessionUpdateInput {
  status?: SessionStatus;
  title?: string;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  teacherId?: string;
  /** Why it was cancelled. Shown to the family and teacher. */
  reason?: string;
}

export interface SessionUpdateResult {
  id: string;
  status: SessionStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  teacherId: string;
  /** The audit ops applied, e.g. ["session.reschedule"]. Empty for a no-op. */
  ops: string[];
  /** How many people a notification was queued for. */
  notified: number;
}

/**
 * Apply a change to one session, with every check, audit and notification.
 *
 * Permission: the session's own teacher, an ORG_ADMIN of its org, or a
 * SUPER_ADMIN. Reassigning to another teacher is admin-only, and the new
 * teacher must belong to the session's org — for a SUPER_ADMIN too, since a
 * class cannot be taught across tenants.
 */
export async function updateSession(
  actor: SchedulingActor,
  sessionId: string,
  input: SessionUpdateInput
): Promise<SessionUpdateResult> {
  const session = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!session) throw new NotFoundError("Session");

  const isAdmin =
    actor.role === "SUPER_ADMIN" || (actor.role === "ORG_ADMIN" && actor.orgId === session.orgId);
  const isOwner = session.teacherId === actor.userId;
  if (!isAdmin && !isOwner) {
    throw new ForbiddenError("Only the teacher or an admin can update this session.");
  }

  const now = Date.now();
  const oldStart = new Date(session.scheduledStart);
  const oldEnd = new Date(session.scheduledEnd);
  const start = input.scheduledStart ?? oldStart;
  // A new start on its own keeps the class's length rather than stretching it
  // to the old end.
  const end =
    input.scheduledEnd ??
    (input.scheduledStart ? new Date(start.getTime() + (oldEnd.getTime() - oldStart.getTime())) : oldEnd);
  if (end.getTime() <= start.getTime()) {
    throw new AppError("scheduledEnd must be after scheduledStart.", 400, "BAD_REQUEST");
  }

  const timeChanged = start.getTime() !== oldStart.getTime() || end.getTime() !== oldEnd.getTime();
  const newTeacherId =
    input.teacherId && input.teacherId !== session.teacherId ? input.teacherId : null;
  const nextStatus = input.status && input.status !== session.status ? input.status : null;
  const title = input.title?.trim();
  const titleChanged = !!title && title !== session.title;
  const moving = timeChanged || !!newTeacherId;

  if (input.status === "CANCELLED" && session.status === "CANCELLED") {
    throw new BusinessRuleError("This class is already cancelled.");
  }
  if (session.mergedIntoId && (moving || nextStatus)) {
    throw new BusinessRuleError("This class was combined into another one. Change that class instead.");
  }
  if (newTeacherId && !isAdmin) throw new ForbiddenError("Only an admin can give a class to another teacher.");

  if (moving) {
    if (session.status !== "SCHEDULED" || (nextStatus && nextStatus !== "SCHEDULED")) {
      throw new BusinessRuleError("Only a scheduled class can be moved or reassigned.");
    }
    if (timeChanged && start.getTime() <= now) {
      throw new BusinessRuleError("The new start time must be in the future.");
    }
    if (!timeChanged && end.getTime() <= now) {
      throw new BusinessRuleError("This class has already ended.");
    }
  }

  if (nextStatus === "CANCELLED" && !["SCHEDULED", "IN_PROGRESS"].includes(session.status)) {
    throw new BusinessRuleError(`A ${session.status.toLowerCase().replace("_", " ")} class cannot be cancelled.`);
  }
  if (nextStatus === "COMPLETED" || nextStatus === "NO_SHOW") {
    if (session.status === "CANCELLED") throw new BusinessRuleError("A cancelled class cannot be marked.");
    if (oldStart.getTime() > now) {
      throw new BusinessRuleError("Only a class that has already started can be marked completed or no-show.");
    }
  }

  const newTeacher = newTeacherId ? await assertTeacherInOrg(newTeacherId, session.orgId, false) : null;

  // Who is booked, before anything changes — a cancel is about to flip these.
  const roster = await db
    .select({
      bookingId: bookings.id,
      userId: bookings.userId,
      studentProfileId: bookings.studentProfileId,
      profileName: studentProfiles.name,
      timezone: users.timezone,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .leftJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
    .where(and(eq(bookings.sessionId, sessionId), ne(bookings.status, "CANCELLED")));

  if (moving) {
    const conflict = await findScheduleConflict(db, {
      orgId: session.orgId,
      teacherId: newTeacherId ?? session.teacherId,
      start,
      end,
      excludeSessionId: sessionId,
      studentProfileIds: roster.map((r) => r.studentProfileId).filter((x): x is string => !!x),
    });
    if (conflict) throw new BusinessRuleError(conflict);
  }

  const ops: string[] = [];
  if (nextStatus === "CANCELLED") ops.push("session.cancel");
  if (nextStatus === "NO_SHOW") ops.push("session.no_show");
  if (nextStatus === "COMPLETED") ops.push("session.complete");
  if (nextStatus === "SCHEDULED" || nextStatus === "IN_PROGRESS") ops.push("session.status");
  if (timeChanged) ops.push("session.reschedule");
  if (newTeacherId) ops.push("session.reassign");
  if (titleChanged) ops.push("session.rename");

  const finalStatus = (nextStatus ?? session.status) as SessionStatus;
  const finalTeacherId = newTeacherId ?? session.teacherId;
  if (ops.length === 0) {
    return { id: sessionId, status: finalStatus, scheduledStart: start, scheduledEnd: end, teacherId: finalTeacherId, ops, notified: 0 };
  }

  const endedNow =
    session.status === "IN_PROGRESS" && (nextStatus === "CANCELLED" || nextStatus === "COMPLETED" || nextStatus === "NO_SHOW");
  let cancelledBookingIds: string[] = [];

  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({
        updatedAt: new Date(),
        ...(nextStatus && { status: nextStatus }),
        ...(titleChanged && { title }),
        ...(timeChanged && { scheduledStart: start, scheduledEnd: end }),
        ...(newTeacherId && { teacherId: newTeacherId }),
        ...(endedNow && !session.actualEnd && { actualEnd: new Date() }),
      })
      .where(and(eq(sessions.id, sessionId), eq(sessions.orgId, session.orgId)));

    if (nextStatus === "CANCELLED") {
      const rows = await tx
        .update(bookings)
        .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(bookings.sessionId, sessionId), ne(bookings.status, "CANCELLED")))
        .returning({ id: bookings.id });
      cancelledBookingIds = rows.map((r) => r.id);
      for (const id of cancelledBookingIds) {
        await insertSchedulingEvent(tx, {
          orgId: session.orgId,
          teacherId: session.teacherId,
          actorId: actor.userId,
          type: "booking.cancelled",
          aggregateType: "booking",
          aggregateId: id,
        });
      }
    }

    // Both teachers' live views need the change: the class left one
    // schedule and arrived on the other.
    for (const teacherId of new Set([session.teacherId, finalTeacherId])) {
      await insertSchedulingEvent(tx, {
        orgId: session.orgId,
        teacherId,
        actorId: actor.userId,
        type: "session.changed",
        aggregateType: "session",
        aggregateId: sessionId,
      });
    }
  });

  afterResponse(drainOutbox({ orgId: session.orgId, limit: 20 }));

  // A class that stops while people are in it must not keep a room running
  // (and billing) with nothing left to close it.
  if (endedNow) {
    await closeAttendanceRows({ sessionId }).catch(() => {});
    try {
      await getRoomServiceClient().deleteRoom(session.videoRoomName || generateRoomName(sessionId));
    } catch {
      // Already gone, or LiveKit not configured here. The status change stands.
    }
  }

  await auditOps(actor, session.orgId, sessionId, ops, {
    reason: input.reason?.trim() || null,
    previousStatus: session.status,
    cancelledBookingIds,
    from: { scheduledStart: oldStart.toISOString(), scheduledEnd: oldEnd.toISOString(), teacherId: session.teacherId, title: session.title },
    to: { scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), teacherId: finalTeacherId, title: title ?? session.title },
  });

  const notified = queueNotifications({
    actor,
    orgId: session.orgId,
    sessionId,
    cancelled: nextStatus === "CANCELLED",
    reason: input.reason?.trim() || null,
    timeChanged,
    oldStart,
    newStart: start,
    oldTeacherId: session.teacherId,
    newTeacher,
    roster,
  });

  return { id: sessionId, status: finalStatus, scheduledStart: start, scheduledEnd: end, teacherId: finalTeacherId, ops, notified: await notified };
}

const AUDIT_ACTION: Record<string, AuditAction> = {
  "session.cancel": "BOOKING_CANCELLED",
  "session.no_show": "SESSION_COMPLETED",
  "session.complete": "SESSION_COMPLETED",
  "session.status": "SETTINGS_CHANGED",
  "session.reschedule": "SETTINGS_CHANGED",
  "session.reassign": "SETTINGS_CHANGED",
  "session.rename": "SETTINGS_CHANGED",
};

async function auditOps(
  actor: SchedulingActor,
  orgId: string,
  sessionId: string,
  ops: string[],
  detail: {
    reason: string | null;
    previousStatus: string;
    cancelledBookingIds: string[];
    from: Record<string, unknown>;
    to: Record<string, unknown>;
  }
): Promise<void> {
  for (const op of ops) {
    const metadata: Record<string, unknown> = { op, previousStatus: detail.previousStatus };
    if (op === "session.cancel") Object.assign(metadata, { reason: detail.reason, cancelledBookingIds: detail.cancelledBookingIds });
    if (op === "session.reschedule") Object.assign(metadata, { from: { start: detail.from.scheduledStart, end: detail.from.scheduledEnd }, to: { start: detail.to.scheduledStart, end: detail.to.scheduledEnd } });
    if (op === "session.reassign") Object.assign(metadata, { fromTeacherId: detail.from.teacherId, toTeacherId: detail.to.teacherId });
    if (op === "session.rename") Object.assign(metadata, { fromTitle: detail.from.title, toTitle: detail.to.title });
    await logAudit({
      orgId,
      actorId: actor.userId,
      action: AUDIT_ACTION[op],
      target: `session:${sessionId}`,
      metadata,
      ipAddress: actor.ipAddress,
    });
  }
}

// ─── Notifications ──────────────────────────────────────────────────────────

interface Message {
  userId: string;
  title: string;
  body: string;
  path: string;
}

/**
 * Work out who hears what, and send it after the response. Returns how many
 * messages were queued. The actor is never told about their own change.
 */
async function queueNotifications(opts: {
  actor: SchedulingActor;
  orgId: string;
  sessionId: string;
  cancelled: boolean;
  reason: string | null;
  timeChanged: boolean;
  oldStart: Date;
  newStart: Date;
  oldTeacherId: string;
  newTeacher: { id: string; name: string } | null;
  roster: { userId: string; profileName: string | null; timezone: string | null }[];
}): Promise<number> {
  const reassigned = !!opts.newTeacher;
  if (!opts.cancelled && !opts.timeChanged && !reassigned) return 0;

  const teacherIds = [opts.oldTeacherId, ...(opts.newTeacher ? [opts.newTeacher.id] : [])];
  const teacherRows = await db
    .select({ id: users.id, name: users.name, timezone: users.timezone })
    .from(users)
    .where(inArray(users.id, teacherIds));
  const zoneOf = new Map(teacherRows.map((t) => [t.id, t.timezone]));
  const oldTeacherName = teacherRows.find((t) => t.id === opts.oldTeacherId)?.name ?? "your teacher";

  const studentNames = [...new Set(opts.roster.map((r) => r.profileName).filter(Boolean))].join(", ") || "your student";
  const reasonText = opts.reason ? ` Reason: ${opts.reason}` : "";
  const messages: Message[] = [];

  // Families: one message per account, in that account's own zone.
  const families = new Map(opts.roster.map((r) => [r.userId, r.timezone]));
  for (const [userId, zone] of families) {
    const was = formatFor(opts.oldStart, zone);
    const moved = formatFor(opts.newStart, zone);
    let title: string;
    let body: string;
    if (opts.cancelled) {
      title = "Class cancelled";
      body = `Your class on ${was} has been cancelled.${reasonText}`;
    } else if (opts.timeChanged && reassigned) {
      title = "Your class has changed";
      body = `Your class on ${was} is now on ${moved} with ${opts.newTeacher!.name}.`;
    } else if (opts.timeChanged) {
      title = "Class rescheduled";
      body = `Your class on ${was} has moved to ${moved}.`;
    } else {
      title = "New teacher for your class";
      body = `Your class on ${was} will now be taught by ${opts.newTeacher!.name} instead of ${oldTeacherName}.`;
    }
    messages.push({ userId, title, body, path: "/dashboard" });
  }

  // The teacher who had the class.
  {
    const zone = zoneOf.get(opts.oldTeacherId);
    const was = formatFor(opts.oldStart, zone);
    let title: string;
    let body: string;
    if (opts.cancelled) {
      title = "Class cancelled";
      body = `Your class with ${studentNames} on ${was} has been cancelled.${reasonText}`;
    } else if (reassigned) {
      title = "Class reassigned";
      body = `Your class with ${studentNames} on ${was} has been given to another teacher.`;
    } else {
      title = "Class rescheduled";
      body = `Your class with ${studentNames} on ${was} has moved to ${formatFor(opts.newStart, zone)}.`;
    }
    messages.push({ userId: opts.oldTeacherId, title, body, path: "/dashboard/teacher" });
  }

  // The teacher who now has it.
  if (opts.newTeacher) {
    const when = formatFor(opts.newStart, zoneOf.get(opts.newTeacher.id));
    messages.push({
      userId: opts.newTeacher.id,
      title: "New class assigned",
      body: `You are now teaching ${studentNames} on ${when}.`,
      path: "/dashboard/teacher",
    });
  }

  const outgoing = messages.filter((m) => m.userId !== opts.actor.userId);
  afterResponse(
    Promise.all(
      outgoing.map((m) =>
        notify({
          orgId: opts.orgId,
          userIds: [m.userId],
          // The closest existing type: the class is no longer where it was.
          type: "CLASS_MOVED",
          title: m.title,
          body: m.body,
          path: m.path,
          sessionId: opts.sessionId,
        })
      )
    )
  );
  return outgoing.length;
}
