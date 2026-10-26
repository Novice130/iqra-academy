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
 * A CLASS IS SEVERAL ROWS: a group row for the teacher plus an INDIVIDUAL row
 * per student, running at the same time. Cancel, reschedule, reassign and
 * "completed" apply to every row that overlaps the requested one, or the
 * students' rows stay live after the teacher's is cancelled. A no-show is one
 * student's absence and stays on its own row.
 *
 * ORDER OF WORK, and why:
 *   1. One transaction that first advisory-locks the teachers' schedules and
 *      re-reads the rows FOR UPDATE, then validates, checks conflicts and
 *      writes — so two people acting at once cannot both pass the checks.
 *      The session rows, their bookings and the realtime outbox events commit
 *      together, so a live dashboard never sees half a change.
 *   2. After commit: audit, LiveKit room clean-up, then notifications deferred
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

import { and, eq, gt, inArray, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessions, studentProfiles, teacherTimeOff, users } from "@/db/schema";
import { AppError, BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { assertTeacherInOrg } from "@/lib/session-access";
import { insertSchedulingEvent } from "@/lib/realtime/outbox";
import { drainOutbox } from "@/lib/realtime/outbox-publisher";
import { afterResponse } from "@/lib/after-response";
import { logAuditBatch, type AuditAction } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { closeAttendanceRows } from "@/lib/attendance";
import { generateRoomName, getRoomServiceClient } from "@/lib/livekit";
import { wallClockRoundTrips, zonedDayParts, zonedWallClockToInstant } from "@/lib/slots";
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
 * Parse "YYYY-MM-DD" into a real calendar date, or throw. `Date.UTC` rolls
 * 2026-02-30 over to March 2 and month 13 into next year without complaint,
 * so the parts are read back and compared.
 */
function parseDateKey(date: string): [number, number, number] {
  const d = DATE_RE.exec(date);
  if (!d) throw new AppError("Date must be YYYY-MM-DD.", 400, "BAD_REQUEST");
  const [y, m, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const probe = new Date(Date.UTC(y, m - 1, day));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== day) {
    throw new AppError(`${date} is not a real date.`, 400, "BAD_REQUEST");
  }
  return [y, m, day];
}

/**
 * The instant a wall-clock reading names in a zone, e.g. ("2026-11-02",
 * "17:30", "America/Chicago").
 *
 * Forms send the reading plus the zone it was typed in rather than an ISO
 * instant, because the browser's own `new Date("…T17:30")` uses the device
 * zone — which is not the viewer zone whenever the account sets one. A time
 * that does not exist (the spring-forward hour) is refused rather than
 * silently moved an hour, and the result is read back in the zone — date as
 * well as time — so nothing that rolled over gets through.
 */
export function wallClockToInstant(date: string, time: string, zone: string): Date {
  const [y, m, d] = parseDateKey(date);
  const t = TIME_RE.exec(time);
  if (!t) throw new AppError("Time must be HH:mm.", 400, "BAD_REQUEST");
  if (!isValidZone(zone)) throw new AppError(`Unknown time zone "${zone}".`, 400, "BAD_REQUEST");
  const [hh, mm] = [Number(t[1]), Number(t[2])];
  if (hh > 23 || mm > 59) throw new AppError("Time must be between 00:00 and 23:59.", 400, "BAD_REQUEST");
  const instant = zonedWallClockToInstant(y, m, d, hh, mm, zone);
  if (Number.isNaN(instant.getTime())) throw new AppError("That date is not valid.", 400, "BAD_REQUEST");
  const back = zonedDayParts(instant, zone);
  if (back.y !== y || back.m !== m || back.d !== d || !wallClockRoundTrips(instant, zone, hh, mm)) {
    throw new BusinessRuleError(`${time} does not exist on ${date} in ${zone} (the clocks change that night).`);
  }
  return instant;
}

/** "2026-11-02" plus n days, as a calendar date (no zone involved). Throws on a date that does not exist. */
export function addDaysToDateKey(date: string, days: number): string {
  const [y, m, d] = parseDateKey(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
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

// ─── Locks and conflicts ────────────────────────────────────────────────────

/**
 * Serialise every schedule change for these teachers until the transaction
 * ends. Two admins booking the same free slot would otherwise both pass the
 * conflict check and both insert. Sorted so two transactions locking the
 * same pair (a swap) always take them in the same order and cannot deadlock.
 */
export async function lockTeacherSchedules(tx: Tx, teacherIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(teacherIds.filter((x): x is string => !!x))].sort();
  for (const id of ids) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
  }
}

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
    /** The rows being moved — every row of the class — cannot clash with themselves. */
    excludeSessionIds?: string[];
    studentProfileIds?: string[];
  }
): Promise<string | null> {
  const notSelf = opts.excludeSessionIds?.length ? [notInArray(sessions.id, opts.excludeSessionIds)] : [];

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

type SessionRow = typeof sessions.$inferSelect;

/**
 * Every row of the class this row belongs to, locked FOR UPDATE.
 *
 * A group class is several rows — a group row for the teacher plus an
 * INDIVIDUAL row per student — running at the same time with the same
 * teacher. Cancelling or moving one alone leaves the others live and their
 * families untold, so class-level changes go to all of them.
 *
 * Members are rows that *overlap in time* with this one (half-open), not rows
 * that merely start near it: back-to-back 1:1 lessons (10:00–10:30 and
 * 10:30–11:00) are two classes with two families, and the room resolver's
 * 90-minute start window would wrongly fold them into one.
 */
async function lockClassRows(tx: Tx, row: SessionRow): Promise<SessionRow[]> {
  const rows = await tx
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.teacherId, row.teacherId),
        eq(sessions.orgId, row.orgId),
        isNull(sessions.mergedIntoId),
        ne(sessions.status, "CANCELLED"),
        lt(sessions.scheduledStart, new Date(row.scheduledEnd)),
        gt(sessions.scheduledEnd, new Date(row.scheduledStart))
      )
    )
    .for("update");
  return rows.some((r) => r.id === row.id) ? rows : [...rows, row];
}

/**
 * Fold rows into classes by the same rule `lockClassRows` applies an action
 * with, so a list entry and its Cancel button reach the same rows: the
 * earliest row of a teacher opens a class, and every later row of that
 * teacher starting before it ends (so overlapping it) joins. Back-to-back
 * lessons stay separate. Pure; callers keep live and cancelled rows apart.
 */
export function groupClassRows<T extends { id: string; teacherId: string; scheduledStart: Date | string; scheduledEnd: Date | string }>(
  rows: T[]
): { canonical: T; sessions: T[] }[] {
  const ms = (d: Date | string) => new Date(d).getTime();
  const sorted = [...rows].sort((a, b) => ms(a.scheduledStart) - ms(b.scheduledStart) || a.id.localeCompare(b.id));
  const groups: { canonical: T; sessions: T[] }[] = [];
  const current = new Map<string, { canonical: T; sessions: T[] }>();
  for (const row of sorted) {
    const open = current.get(row.teacherId);
    if (open && ms(row.scheduledStart) < ms(open.canonical.scheduledEnd)) {
      open.sessions.push(row);
    } else {
      const group = { canonical: row, sessions: [row] };
      groups.push(group);
      current.set(row.teacherId, group);
    }
  }
  return groups;
}

// ─── Updating a class ───────────────────────────────────────────────────────

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
  /** Every session row the change was applied to (the whole class). */
  sessionIds: string[];
  /** How many people a notification was queued for. */
  notified: number;
}

const ENDING: SessionStatus[] = ["CANCELLED", "COMPLETED", "NO_SHOW"];

interface RosterRow {
  bookingId: string;
  sessionId: string;
  userId: string;
  studentProfileId: string | null;
  profileName: string | null;
  timezone: string | null;
}

/**
 * Apply a change to a class, with every check, audit and notification.
 *
 * Cancel, reschedule, reassign and the completed / no-show marks apply to
 * every row of the class (see `lockClassRows`) — except NO_SHOW, which is
 * one student's absence and stays on the requested row. A rename, and the legacy
 * SCHEDULED / IN_PROGRESS status writes teachers' tools may send, touch only
 * the row asked for.
 *
 * Permission: the session's own teacher, an ORG_ADMIN of its org, or a
 * SUPER_ADMIN. Reassigning is admin-only, and the new teacher must belong to
 * the session's org — for a SUPER_ADMIN too, since a class cannot be taught
 * across tenants.
 *
 * Concurrency: the teachers' schedules are advisory-locked and the rows read
 * FOR UPDATE inside the transaction, and every check runs there, so two
 * people changing the same class or booking the same slot cannot both win.
 */
export async function updateSession(
  actor: SchedulingActor,
  sessionId: string,
  input: SessionUpdateInput
): Promise<SessionUpdateResult> {
  const first = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    columns: { teacherId: true, orgId: true },
  });
  if (!first) throw new NotFoundError("Session");

  const isAdmin = actor.role === "SUPER_ADMIN" || (actor.role === "ORG_ADMIN" && actor.orgId === first.orgId);
  if (!isAdmin && first.teacherId !== actor.userId) {
    throw new ForbiddenError("Only the teacher or an admin can update this session.");
  }
  const wantsTeacher = input.teacherId && input.teacherId !== first.teacherId ? input.teacherId : null;
  if (wantsTeacher && !isAdmin) throw new ForbiddenError("Only an admin can give a class to another teacher.");
  const newTeacher = wantsTeacher ? await assertTeacherInOrg(wantsTeacher, first.orgId, false) : null;

  const plan = await db.transaction(async (tx) => {
    await lockTeacherSchedules(tx, [first.teacherId, newTeacher?.id]);

    const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for("update");
    if (!session) throw new NotFoundError("Session");
    if (session.teacherId !== first.teacherId) {
      throw new ConflictError("This class was changed by someone else just now. Reload and try again.");
    }

    const now = Date.now();
    const oldStart = new Date(session.scheduledStart);
    const oldEnd = new Date(session.scheduledEnd);
    const start = input.scheduledStart ?? oldStart;
    // A new start on its own keeps the class's length.
    const end =
      input.scheduledEnd ??
      (input.scheduledStart ? new Date(start.getTime() + (oldEnd.getTime() - oldStart.getTime())) : oldEnd);
    if (end.getTime() <= start.getTime()) {
      throw new AppError("scheduledEnd must be after scheduledStart.", 400, "BAD_REQUEST");
    }

    const timeChanged = start.getTime() !== oldStart.getTime() || end.getTime() !== oldEnd.getTime();
    const nextStatus = input.status && input.status !== session.status ? input.status : null;
    const classStatus = nextStatus && ENDING.includes(nextStatus) ? nextStatus : null;
    const rowStatus = nextStatus && !classStatus ? nextStatus : null;
    const title = input.title?.trim();
    const titleChanged = !!title && title !== session.title;
    const moving = timeChanged || !!newTeacher;

    if (input.status === "CANCELLED" && session.status === "CANCELLED") {
      throw new BusinessRuleError("This class is already cancelled.");
    }
    if (session.mergedIntoId && (moving || nextStatus)) {
      throw new BusinessRuleError("This class was combined into another one. Change that class instead.");
    }
    if (moving) {
      if (session.status !== "SCHEDULED" || (nextStatus && nextStatus !== "SCHEDULED")) {
        throw new BusinessRuleError("Only a scheduled class can be moved or reassigned.");
      }
      if (timeChanged && start.getTime() <= now) throw new BusinessRuleError("The new start time must be in the future.");
      if (!timeChanged && end.getTime() <= now) throw new BusinessRuleError("This class has already ended.");
    }
    if (classStatus === "CANCELLED" && !["SCHEDULED", "IN_PROGRESS"].includes(session.status)) {
      throw new BusinessRuleError(`A ${session.status.toLowerCase().replace("_", " ")} class cannot be cancelled.`);
    }
    if (classStatus === "COMPLETED" || classStatus === "NO_SHOW") {
      if (session.status === "CANCELLED") throw new BusinessRuleError("A cancelled class cannot be marked.");
      if (oldStart.getTime() > now) {
        throw new BusinessRuleError("Only a class that has already started can be marked completed or no-show.");
      }
    }

    // A no-show is one student's absence, recorded on their own row.
    const classWide = moving || classStatus === "CANCELLED" || classStatus === "COMPLETED";
    const members = classWide ? await lockClassRows(tx, session) : [session];
    const memberIds = members.map((m) => m.id);

    if (moving && members.some((m) => m.status !== "SCHEDULED")) {
      throw new BusinessRuleError("Part of this class has already started or ended, so it cannot be moved.");
    }

    const roster: RosterRow[] = await tx
      .select({
        bookingId: bookings.id,
        sessionId: bookings.sessionId,
        userId: bookings.userId,
        studentProfileId: bookings.studentProfileId,
        profileName: studentProfiles.name,
        timezone: users.timezone,
      })
      .from(bookings)
      .innerJoin(users, eq(bookings.userId, users.id))
      .leftJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
      .where(and(inArray(bookings.sessionId, memberIds), ne(bookings.status, "CANCELLED")));

    // Every row moves by the same amount, so a class keeps its shape.
    const startShift = start.getTime() - oldStart.getTime();
    const endShift = end.getTime() - oldEnd.getTime();
    const moved = (m: SessionRow) => ({
      start: new Date(new Date(m.scheduledStart).getTime() + startShift),
      end: new Date(new Date(m.scheduledEnd).getTime() + endShift),
    });
    const finalTeacherId = newTeacher?.id ?? session.teacherId;

    if (moving) {
      for (const m of members) {
        const w = moved(m);
        if (w.end <= w.start) throw new BusinessRuleError("That length is too short for part of this class.");
        const conflict = await findScheduleConflict(tx, {
          orgId: session.orgId,
          teacherId: finalTeacherId,
          start: w.start,
          end: w.end,
          excludeSessionIds: memberIds,
          studentProfileIds: roster.filter((r) => r.sessionId === m.id).map((r) => r.studentProfileId).filter((x): x is string => !!x),
        });
        if (conflict) throw new BusinessRuleError(conflict);
      }
    }

    const ops: string[] = [];
    if (classStatus === "CANCELLED") ops.push("session.cancel");
    if (classStatus === "NO_SHOW") ops.push("session.no_show");
    if (classStatus === "COMPLETED") ops.push("session.complete");
    if (rowStatus) ops.push("session.status");
    if (timeChanged) ops.push("session.reschedule");
    if (newTeacher) ops.push("session.reassign");
    if (titleChanged) ops.push("session.rename");

    const statusFor = (m: SessionRow): SessionStatus | null => {
      if (m.id === session.id && rowStatus) return rowStatus;
      if (!classStatus || m.status === classStatus) return null;
      if (classStatus === "CANCELLED") return ["SCHEDULED", "IN_PROGRESS"].includes(m.status) ? classStatus : null;
      if (classStatus === "NO_SHOW") return m.id === session.id ? classStatus : null;
      // COMPLETED: rows already in a final state keep it (a student's
      // no-show stays a no-show), and a row that has not started yet is not
      // marked done. The row asked for is always set — that is the request.
      if (m.id === session.id) return classStatus;
      if (ENDING.includes(m.status as SessionStatus)) return null;
      return new Date(m.scheduledStart).getTime() <= now ? classStatus : null;
    };

    const changed: { row: SessionRow; endedNow: boolean }[] = [];
    if (ops.length > 0) {
      for (const m of members) {
        const status = statusFor(m);
        const rename = titleChanged && m.id === session.id;
        if (!status && !moving && !rename) continue;
        const endedNow = m.status === "IN_PROGRESS" && !!status && ENDING.includes(status);
        const w = moved(m);
        const updated = await tx
          .update(sessions)
          .set({
            updatedAt: new Date(),
            ...(status && { status }),
            ...(rename && { title }),
            ...(timeChanged && { scheduledStart: w.start, scheduledEnd: w.end }),
            ...(newTeacher && { teacherId: newTeacher.id }),
            ...(endedNow && !m.actualEnd && { actualEnd: new Date() }),
          })
          // Guarded on what was read, so a row that changed underneath fails
          // loudly instead of being overwritten.
          .where(and(eq(sessions.id, m.id), eq(sessions.orgId, m.orgId), eq(sessions.status, m.status), eq(sessions.teacherId, m.teacherId)))
          .returning({ id: sessions.id });
        if (updated.length === 0) throw new ConflictError("This class was changed by someone else just now. Reload and try again.");
        changed.push({ row: m, endedNow });
      }
    }

    let cancelledBookingIds: string[] = [];
    const cancelledRows = changed.filter((c) => statusFor(c.row) === "CANCELLED").map((c) => c.row.id);
    if (cancelledRows.length > 0) {
      const rows = await tx
        .update(bookings)
        .set({ status: "CANCELLED", cancelledAt: new Date(), updatedAt: new Date() })
        .where(and(inArray(bookings.sessionId, cancelledRows), ne(bookings.status, "CANCELLED")))
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
    for (const c of changed) {
      for (const teacherId of new Set([session.teacherId, finalTeacherId])) {
        await insertSchedulingEvent(tx, {
          orgId: session.orgId,
          teacherId,
          actorId: actor.userId,
          type: "session.changed",
          aggregateType: "session",
          aggregateId: c.row.id,
        });
      }
    }

    return {
      session,
      ops,
      changed,
      roster,
      cancelledBookingIds,
      oldStart,
      oldEnd,
      start,
      end,
      title,
      timeChanged,
      finalTeacherId,
      finalStatus: (nextStatus ?? session.status) as SessionStatus,
    };
  });

  const { session, ops, changed } = plan;
  const result = {
    id: sessionId,
    status: plan.finalStatus,
    scheduledStart: plan.start,
    scheduledEnd: plan.end,
    teacherId: plan.finalTeacherId,
    ops,
    sessionIds: changed.map((c) => c.row.id),
  };
  if (ops.length === 0) return { ...result, notified: 0 };

  afterResponse(drainOutbox({ orgId: session.orgId, limit: 20 }));

  // A class that stops while people are in it must not keep a room running
  // (and billing) with nothing left to close it. The room is named after one
  // row of the class, so every row's name is tried.
  for (const c of changed.filter((x) => x.endedNow)) {
    await closeAttendanceRows({ sessionId: c.row.id }).catch(() => {});
  }
  if (changed.some((x) => x.endedNow)) {
    for (const name of new Set(changed.map((c) => c.row.videoRoomName || generateRoomName(c.row.id)))) {
      try {
        await getRoomServiceClient().deleteRoom(name);
      } catch {
        // Already gone, or LiveKit not configured here. The status change stands.
      }
    }
  }

  await auditOps(actor, session.orgId, changed.map((c) => c.row.id), sessionId, ops, {
    reason: input.reason?.trim() || null,
    previousStatus: session.status,
    cancelledBookingIds: plan.cancelledBookingIds,
    from: { scheduledStart: plan.oldStart.toISOString(), scheduledEnd: plan.oldEnd.toISOString(), teacherId: session.teacherId, title: session.title },
    to: { scheduledStart: plan.start.toISOString(), scheduledEnd: plan.end.toISOString(), teacherId: plan.finalTeacherId, title: plan.title ?? session.title },
  });

  const notified = await queueNotifications({
    actor,
    orgId: session.orgId,
    sessionId,
    cancelled: ops.includes("session.cancel"),
    reason: input.reason?.trim() || null,
    timeChanged: plan.timeChanged,
    oldStart: plan.oldStart,
    newStart: plan.start,
    oldTeacherId: session.teacherId,
    newTeacher,
    roster: plan.roster,
  });

  return { ...result, notified };
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

/** One entry per op per changed row, so each row's history page shows it. */
async function auditOps(
  actor: SchedulingActor,
  orgId: string,
  rowIds: string[],
  requestedId: string,
  ops: string[],
  detail: {
    reason: string | null;
    previousStatus: string;
    cancelledBookingIds: string[];
    from: Record<string, unknown>;
    to: Record<string, unknown>;
  }
): Promise<void> {
  const targets = rowIds.length > 0 ? rowIds : [requestedId];
  const entries = ops.flatMap((op) => {
    const metadata: Record<string, unknown> = { op, previousStatus: detail.previousStatus, requestedSessionId: requestedId, classSessionIds: targets };
    if (op === "session.cancel") Object.assign(metadata, { reason: detail.reason, cancelledBookingIds: detail.cancelledBookingIds });
    if (op === "session.reschedule") Object.assign(metadata, { from: { start: detail.from.scheduledStart, end: detail.from.scheduledEnd }, to: { start: detail.to.scheduledStart, end: detail.to.scheduledEnd } });
    if (op === "session.reassign") Object.assign(metadata, { fromTeacherId: detail.from.teacherId, toTeacherId: detail.to.teacherId });
    if (op === "session.rename") Object.assign(metadata, { fromTitle: detail.from.title, toTitle: detail.to.title });
    // A rename or legacy status write touched only the requested row.
    const rows = op === "session.rename" || op === "session.status" ? [requestedId] : targets;
    return rows.map((id) => ({
      orgId,
      actorId: actor.userId,
      action: AUDIT_ACTION[op],
      target: `session:${id}`,
      metadata,
      ipAddress: actor.ipAddress,
    }));
  });
  await logAuditBatch(entries);
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
