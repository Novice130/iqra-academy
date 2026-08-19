/**
 * @fileoverview Combining two consecutive classes into one.
 *
 * THE SITUATION: a teacher has Aisha at 6:00 and Bilal at 6:30, both on the
 * same surah, both half an hour. Teaching them together is one class instead
 * of two — an hour of the teacher's evening back, and two students who learn
 * from each other's recitation.
 *
 * ── Why nothing is deleted ──────────────────────────────────────────────────
 * Nine tables carry a foreign key to `sessions`: bookings, session_attendees,
 * session_attendance, notifications, progress_records, teacher_feedback,
 * chat_rooms, call_invites and guest_join_requests. Deleting the absorbed row
 * either fails on a constraint or, with a cascade, silently takes a family's
 * attendance and progress history with it. So the absorbed row is set
 * CANCELLED and its `merged_into_id` points at the survivor. Anything that
 * lands on the old row can follow the pointer; anything already written about
 * it stays true.
 *
 * ── What moves and what stays ───────────────────────────────────────────────
 * Only `bookings` move: a booking is a claim on a future class, so it belongs
 * to whichever row that class now is. Everything else is a record of
 * something that already happened (attendance, feedback, progress, the chat
 * that took place) and is left pointing at the row it happened on. Moving
 * history would be rewriting it.
 *
 * ── Why the room resolver is not enough ─────────────────────────────────────
 * lib/class-room.ts already sends two rows in the same 90-minute window to
 * one LiveKit room, so a 6:00 and a 6:30 class *technically* meet. That is a
 * fix for split rooms, not a merge: both students still see their own class
 * at their own time, both are counted separately in the schedule, and each
 * gets their own half hour of the teacher's attention on paper. Merging says
 * so in the data.
 *
 * @module lib/class-merge
 */

import { and, asc, eq, gt, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "./db";
import { bookings, sessions, studentProfiles, users } from "@/db/schema";

/**
 * How much dead air still counts as "back to back".
 *
 * 30 minutes, which is one class length: a 6:00 and a 7:00 class have a whole
 * empty slot between them, and combining those moves a family an hour without
 * anyone deciding to. Overlaps are candidates too — a double-booked teacher
 * is the strongest case for merging there is.
 */
export const CONSECUTIVE_GAP_MS = 30 * 60 * 1000;

/**
 * The most students one merged class may hold.
 *
 * Four is the point where a 30-minute class stops being able to hear everyone
 * recite. It is not a plan limit — plans cap students per *family*, and a
 * merged class is normally two families.
 */
export const MAX_CLASS_SIZE = 4;

/** How far ahead to look for pairs. Beyond this the schedule will change anyway. */
export const CANDIDATE_HORIZON_MS = 21 * 24 * 60 * 60 * 1000;

export interface MergeSessionSummary {
  id: string;
  teacherId: string;
  teacherName: string | null;
  title: string | null;
  track: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  /** Names of who is booked, child profile name preferred over account name. */
  students: string[];
}

export interface MergeCandidate {
  /** The one that starts first. */
  earlier: MergeSessionSummary;
  later: MergeSessionSummary;
  /** Empty air between them, in minutes. Negative when they overlap. */
  gapMinutes: number;
}

/**
 * Sessions that could still be merged, with who is booked on each.
 *
 * Scheduled and in the future only. A class that has started, or has been and
 * gone, is not a candidate: merging it would move an attendance record's slot
 * out from under it, and there is nothing to save by then anyway.
 */
export async function loadMergeableSessions(
  orgId: string,
  teacherId: string | null,
  now: Date = new Date()
): Promise<MergeSessionSummary[]> {
  const horizon = new Date(now.getTime() + CANDIDATE_HORIZON_MS);

  const conditions = [
    eq(sessions.orgId, orgId),
    eq(sessions.status, "SCHEDULED"),
    isNull(sessions.mergedIntoId),
    gt(sessions.scheduledStart, now),
    lt(sessions.scheduledStart, horizon),
    // A trial is a stranger's first class, one-to-one with the teacher by
    // design. Folding one into a paying student's class is not a scheduling
    // decision, it is a different product.
    eq(sessions.isTrial, false),
  ];
  if (teacherId) conditions.push(eq(sessions.teacherId, teacherId));

  const rows = await db
    .select({
      id: sessions.id,
      teacherId: sessions.teacherId,
      teacherName: users.name,
      title: sessions.title,
      track: sessions.track,
      scheduledStart: sessions.scheduledStart,
      scheduledEnd: sessions.scheduledEnd,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.teacherId))
    .where(and(...conditions))
    .orderBy(asc(sessions.teacherId), asc(sessions.scheduledStart));

  if (rows.length === 0) return [];

  const names = await studentNamesBySession(rows.map((r) => r.id));

  return rows.map((r) => ({
    id: r.id,
    teacherId: r.teacherId,
    teacherName: r.teacherName,
    title: r.title,
    track: r.track,
    scheduledStart: r.scheduledStart.toISOString(),
    scheduledEnd: r.scheduledEnd.toISOString(),
    students: names.get(r.id) ?? [],
  }));
}

/**
 * Who is booked on each of these sessions.
 *
 * The child's profile name wins over the account name: the account is the
 * parent, and "Fatima Khan" on the schedule when the class is for her son is
 * the kind of wrong that a teacher notices in front of the student.
 */
export async function studentNamesBySession(
  sessionIds: string[]
): Promise<Map<string, string[]>> {
  const byId = new Map<string, string[]>();
  if (sessionIds.length === 0) return byId;

  const rows = await db
    .select({
      sessionId: bookings.sessionId,
      profileName: studentProfiles.name,
      accountName: users.name,
      accountEmail: users.email,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.userId))
    .leftJoin(studentProfiles, eq(studentProfiles.id, bookings.studentProfileId))
    .where(and(
      inArray(bookings.sessionId, sessionIds),
      ne(bookings.status, "CANCELLED")
    ));

  for (const r of rows) {
    const list = byId.get(r.sessionId) ?? [];
    list.push(r.profileName || r.accountName || r.accountEmail);
    byId.set(r.sessionId, list);
  }
  return byId;
}

/**
 * Pair up whatever is back to back.
 *
 * Greedy and non-transitive, deliberately, and for the same reason
 * `groupIntoOccurrences` is: a teacher with six half-hour classes in a row
 * would otherwise be offered one merge of all six. Each session is offered at
 * most once, so acting on a suggestion never leaves a stale one behind it.
 */
export function pairConsecutive(rows: MergeSessionSummary[]): MergeCandidate[] {
  const ordered = [...rows].sort((a, b) => {
    if (a.teacherId !== b.teacherId) return a.teacherId.localeCompare(b.teacherId);
    const t = Date.parse(a.scheduledStart) - Date.parse(b.scheduledStart);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  const out: MergeCandidate[] = [];
  const used = new Set<string>();

  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    if (used.has(a.id) || used.has(b.id)) continue;
    if (a.teacherId !== b.teacherId) continue;

    const gap = Date.parse(b.scheduledStart) - Date.parse(a.scheduledEnd);
    if (gap > CONSECUTIVE_GAP_MS) continue;
    // Nobody booked is nothing to merge — an empty slot is not a class.
    if (a.students.length === 0 || b.students.length === 0) continue;
    if (a.students.length + b.students.length > MAX_CLASS_SIZE) continue;

    out.push({ earlier: a, later: b, gapMinutes: Math.round(gap / 60000) });
    used.add(a.id);
    used.add(b.id);
  }

  return out;
}

/** Everything the merge screen needs, in one call. */
export async function findMergeCandidates(
  orgId: string,
  teacherId: string | null,
  now: Date = new Date()
): Promise<MergeCandidate[]> {
  return pairConsecutive(await loadMergeableSessions(orgId, teacherId, now));
}
