/**
 * @fileoverview Attendance — closing out rows, and turning them into a report.
 *
 * The write side is three sources that must not fight each other: the join API
 * opens a row, the leave beacon closes it, and the LiveKit webhook closes it
 * too (for the phone that was killed before any beacon could fire). All of
 * them go through `closeAttendanceRows`, which only ever fills a row that is
 * still open — so whichever arrives first wins and the second is a no-op.
 *
 * The read side has one job that is easy to get wrong: a class is several
 * session rows, not one. A group row plus one INDIVIDUAL row per student is
 * the normal shape here, so a report that grouped by session id would show a
 * class of three as three classes of one. Occurrences come from
 * `groupIntoOccurrences` in lib/class-room.ts — the same rule the join API
 * resolves rooms with, deliberately shared so the two can't drift.
 *
 * Nothing here formats a time. Cloudflare Workers run in UTC and this app has
 * been bitten twice by server-side formatting (see docs/timezones.md); every
 * instant leaves as an ISO string and is rendered in the viewer's zone.
 */

import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessionAttendance, sessions, studentProfiles, users } from "@/db/schema";
import { groupIntoOccurrences } from "@/lib/class-room";

/**
 * Fill `leftAt`/`durationSeconds` on still-open attendance rows.
 *
 * Idempotent by construction — the `leftAt IS NULL` predicate means a second
 * caller changes nothing. The duration is computed in SQL from the row's own
 * `joinedAt` rather than from anything a client said, and floored at zero so a
 * clock skew can't produce a negative lesson.
 */
export async function closeAttendanceRows(opts: {
  sessionId: string;
  /** One connection. Preferred — a person can be in the room twice. */
  identity?: string;
  /** All of this user's open connections on the session. */
  userId?: string;
  at?: Date;
}): Promise<void> {
  const at = opts.at ?? new Date();
  const conditions = [
    eq(sessionAttendance.sessionId, opts.sessionId),
    isNull(sessionAttendance.leftAt),
  ];
  if (opts.identity) conditions.push(eq(sessionAttendance.identity, opts.identity));
  if (opts.userId) conditions.push(eq(sessionAttendance.userId, opts.userId));

  await db
    .update(sessionAttendance)
    .set({
      leftAt: at,
      durationSeconds: sql`GREATEST(0, EXTRACT(EPOCH FROM (${at.toISOString()}::timestamp - ${sessionAttendance.joinedAt}))::int)`,
    })
    .where(and(...conditions));
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────────────────────

export type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT";

/** Anyone who was, or should have been, in one class. */
export interface AttendancePerson {
  userId: string | null;
  studentProfileId: string | null;
  name: string;
  role: "TEACHER" | "STUDENT" | "OBSERVER";
  /** ISO. Null when they never turned up. */
  firstJoinedAt: string | null;
  /** ISO. Null while they are still in the room, or if nothing ever recorded a leave. */
  lastLeftAt: string | null;
  /** Seconds actually in the room, summed over reconnects. Null if never closed. */
  durationSeconds: number | null;
  /** How many separate connections — >1 means they dropped and came back. */
  connections: number;
  /** Seconds after the scheduled start that they arrived; negative means early. */
  lateBySeconds: number | null;
  status: AttendanceStatus;
}

/** One class, on one day, with everybody who was meant to be in it. */
export interface AttendanceOccurrence {
  sessionId: string;
  sessionIds: string[];
  title: string | null;
  /** ISO — bucket into days in the *viewer's* zone, never here. */
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: string;
  teacherId: string;
  teacherName: string;
  teacher: AttendancePerson | null;
  students: AttendancePerson[];
  observers: AttendancePerson[];
}

/**
 * More than this late and it is worth flagging. Short enough to be meaningful
 * for a one-hour lesson, long enough not to punish a slow camera permission
 * dialog.
 */
const LATE_THRESHOLD_SECONDS = 5 * 60;

interface RawAttendance {
  sessionId: string;
  userId: string;
  studentProfileId: string | null;
  role: "TEACHER" | "STUDENT" | "OBSERVER";
  joinedAt: Date;
  leftAt: Date | null;
  durationSeconds: number | null;
  userName: string | null;
  profileName: string | null;
}

/** Collapse one person's connections into a single arrival, departure and total. */
function collapse(rows: RawAttendance[], scheduledStart: Date | null): Omit<AttendancePerson, "name" | "role"> {
  const sorted = [...rows].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  const first = sorted[0];
  const closed = sorted.filter((r) => r.leftAt);
  const last = closed.length === sorted.length ? closed[closed.length - 1] : null;

  // Only a total if every connection was closed. A half-summed duration reads
  // as "left early" when it actually means "we don't know yet".
  const durationSeconds =
    closed.length === sorted.length
      ? sorted.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0)
      : null;

  const lateBySeconds = scheduledStart
    ? Math.round((first.joinedAt.getTime() - scheduledStart.getTime()) / 1000)
    : null;

  return {
    userId: first.userId,
    studentProfileId: first.studentProfileId,
    firstJoinedAt: first.joinedAt.toISOString(),
    lastLeftAt: last?.leftAt?.toISOString() ?? null,
    durationSeconds,
    connections: sorted.length,
    lateBySeconds,
    status: lateBySeconds !== null && lateBySeconds > LATE_THRESHOLD_SECONDS ? "LATE" : "PRESENT",
  };
}

/**
 * Build the attendance report for a window.
 *
 * `from`/`to` are widened by the caller: the server runs in UTC and the viewer
 * buckets into their own days, so a class at the edge of a local day has to
 * already be in the payload for the client to find it.
 */
export async function getAttendanceReport(opts: {
  orgId: string;
  /** Restrict to one teacher's classes — how a TEACHER sees only their own. */
  teacherId?: string;
  from: Date;
  to: Date;
}): Promise<AttendanceOccurrence[]> {
  const sessionRows = await db
    .select({
      id: sessions.id,
      teacherId: sessions.teacherId,
      title: sessions.title,
      status: sessions.status,
      scheduledStart: sessions.scheduledStart,
      scheduledEnd: sessions.scheduledEnd,
      teacherName: users.name,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.teacherId, users.id))
    .where(
      and(
        eq(sessions.orgId, opts.orgId),
        gte(sessions.scheduledStart, opts.from),
        lte(sessions.scheduledStart, opts.to),
        ...(opts.teacherId ? [eq(sessions.teacherId, opts.teacherId)] : [])
      )
    );

  if (sessionRows.length === 0) return [];

  const occurrences = groupIntoOccurrences(sessionRows);
  const allSessionIds = sessionRows.map((s) => s.id);

  // Everyone who was *meant* to be there, and everyone who actually was, both
  // read across every row of the occurrence: a student's booking normally sits
  // on their own INDIVIDUAL row rather than on the canonical one, so reading
  // the canonical row alone would show a class with nobody expected.
  const [rosterRows, attendanceRows] = await Promise.all([
    db
      .select({
        sessionId: bookings.sessionId,
        userId: bookings.userId,
        studentProfileId: bookings.studentProfileId,
        status: bookings.status,
        profileName: studentProfiles.name,
        userName: users.name,
      })
      .from(bookings)
      .leftJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
      .innerJoin(users, eq(bookings.userId, users.id))
      .where(inArray(bookings.sessionId, allSessionIds)),
    db
      .select({
        sessionId: sessionAttendance.sessionId,
        userId: sessionAttendance.userId,
        studentProfileId: sessionAttendance.studentProfileId,
        role: sessionAttendance.role,
        joinedAt: sessionAttendance.joinedAt,
        leftAt: sessionAttendance.leftAt,
        durationSeconds: sessionAttendance.durationSeconds,
        userName: users.name,
        profileName: studentProfiles.name,
      })
      .from(sessionAttendance)
      .innerJoin(users, eq(sessionAttendance.userId, users.id))
      .leftJoin(studentProfiles, eq(sessionAttendance.studentProfileId, studentProfiles.id))
      .where(inArray(sessionAttendance.sessionId, allSessionIds)),
  ]);

  return occurrences
    .map((occ) => {
      const ids = new Set(occ.sessions.map((s) => s.id));
      const attendance = (attendanceRows as RawAttendance[]).filter((a) => ids.has(a.sessionId));
      const roster = rosterRows.filter((b) => ids.has(b.sessionId) && b.status !== "CANCELLED");

      const byUser = new Map<string, RawAttendance[]>();
      for (const row of attendance) {
        const list = byUser.get(row.userId);
        if (list) list.push(row);
        else byUser.set(row.userId, [row]);
      }

      const start = occ.canonical.scheduledStart;

      const teacherRows = attendance.filter((a) => a.role === "TEACHER");
      const teacher: AttendancePerson | null = teacherRows.length
        ? {
            ...collapse(teacherRows, start),
            name: teacherRows[0].userName || occ.canonical.teacherName || "Teacher",
            role: "TEACHER",
          }
        : null;

      // The roster is the source of truth for who should be listed — that is
      // the only way an absence can appear at all. Attendance is layered on
      // top; a student who joined without a booking (auto-booked on the way
      // in, or rung into the class) is appended so they aren't invisible.
      const seenUsers = new Set<string>();
      const students: AttendancePerson[] = [];

      for (const booking of roster) {
        if (seenUsers.has(booking.userId)) continue;
        seenUsers.add(booking.userId);
        const rows = (byUser.get(booking.userId) ?? []).filter((a) => a.role === "STUDENT");
        const name = booking.profileName || booking.userName || "Student";
        students.push(
          rows.length
            ? { ...collapse(rows, start), name, role: "STUDENT" }
            : {
                userId: booking.userId,
                studentProfileId: booking.studentProfileId,
                name,
                role: "STUDENT",
                firstJoinedAt: null,
                lastLeftAt: null,
                durationSeconds: null,
                connections: 0,
                lateBySeconds: null,
                status: "ABSENT",
              }
        );
      }

      for (const [userId, rows] of byUser) {
        if (seenUsers.has(userId)) continue;
        const studentRows = rows.filter((a) => a.role === "STUDENT");
        if (studentRows.length === 0) continue;
        seenUsers.add(userId);
        students.push({
          ...collapse(studentRows, start),
          name: studentRows[0].profileName || studentRows[0].userName || "Student",
          role: "STUDENT",
        });
      }

      const observerRows = attendance.filter((a) => a.role === "OBSERVER");
      const observersByUser = new Map<string, RawAttendance[]>();
      for (const row of observerRows) {
        const list = observersByUser.get(row.userId);
        if (list) list.push(row);
        else observersByUser.set(row.userId, [row]);
      }
      const observers = [...observersByUser.values()].map((rows) => ({
        ...collapse(rows, start),
        name: rows[0].userName || "Observer",
        role: "OBSERVER" as const,
      }));

      students.sort((a, b) => a.name.localeCompare(b.name));

      return {
        sessionId: occ.canonical.id,
        sessionIds: [...ids],
        title: occ.canonical.title,
        scheduledStart: occ.canonical.scheduledStart?.toISOString() ?? null,
        scheduledEnd: occ.canonical.scheduledEnd?.toISOString() ?? null,
        status: occ.canonical.status,
        teacherId: occ.canonical.teacherId,
        teacherName: occ.canonical.teacherName || "Teacher",
        teacher,
        students,
        observers,
      };
    })
    .sort((a, b) => (b.scheduledStart ?? "").localeCompare(a.scheduledStart ?? ""));
}
