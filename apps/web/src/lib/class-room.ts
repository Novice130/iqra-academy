/**
 * @fileoverview Which room does this class actually happen in?
 *
 * A single class is spread across several session rows: a group row for the
 * teacher plus one INDIVIDUAL row per student is a normal shape here, and each
 * person's dashboard links at their own row. LiveKit creates a room on join,
 * so "join the room named after my row" gives every participant a private
 * room and an empty screen — which is exactly what happened to a real class of
 * three on 2026-08-06.
 *
 * So the room is not per row, it's per *class occurrence*: same teacher, same
 * slot. Everyone resolves to one canonical row and joins the room named after
 * that one, whoever gets there first — a student arriving half an hour early
 * opens the room, the next student walks into it, and the teacher joining late
 * walks into the same one.
 */

import { db } from "@/lib/db";
import { and, asc, eq, gt, gte, lte, ne, or } from "drizzle-orm";
import { sessions } from "@/db/schema";

type SessionRow = typeof sessions.$inferSelect;

/** A class already running belongs to today, not to a tab someone left open. */
export const LIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

/** How early anyone may open the room. Arriving before the teacher is fine. */
export const EARLY_JOIN_MS = 60 * 60 * 1000;

/** How long after the scheduled start the slot still counts as "now". */
export const LATE_JOIN_MS = 3 * 60 * 60 * 1000;

/**
 * Rows within this much of each other are the same occurrence. Wide enough to
 * absorb a 1-on-1 booked five minutes off the group slot, narrow enough not to
 * swallow the next class.
 */
const SIBLING_WINDOW_MS = 90 * 60 * 1000;

export type RoomResolution =
  | { kind: "live"; session: SessionRow }
  | { kind: "openable"; session: SessionRow }
  | { kind: "too-early"; session: SessionRow };

/**
 * Resolves the session whose room everyone for this class should be in.
 *
 * - `live`     — someone is already in there; join it, don't touch its state.
 * - `openable` — nobody yet, but it's within the join window; the caller marks
 *                it started and opens the room.
 * - `too-early` — outside the window entirely; the caller shows the lobby
 *                rather than opening a room for a class that isn't today.
 */
export async function resolveClassRoom(session: SessionRow): Promise<RoomResolution> {
  const now = Date.now();

  // 1. Anything of this teacher's already running wins outright, whether it's
  //    this row, a sibling, or an instant meeting they spun up instead.
  const live = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.teacherId, session.teacherId),
      eq(sessions.status, "IN_PROGRESS"),
      gt(sessions.actualStart, new Date(now - LIVE_WINDOW_MS))
    ),
    orderBy: [asc(sessions.actualStart)],
  });
  if (live) return { kind: "live", session: live };

  // 2. Nothing running. Is this class due?
  const start = session.scheduledStart?.getTime() ?? now;
  if (now < start - EARLY_JOIN_MS || now > start + LATE_JOIN_MS) {
    return { kind: "too-early", session };
  }

  // 3. Pick one row for the whole occurrence, the same way for everybody, so
  //    two students arriving at once can't open two rooms. Earliest slot wins,
  //    ties broken by id — arbitrary but identical for every caller.
  const siblings = await db.query.sessions.findMany({
    where: and(
      eq(sessions.teacherId, session.teacherId),
      ne(sessions.status, "CANCELLED"),
      ne(sessions.status, "COMPLETED"),
      gte(sessions.scheduledStart, new Date(start - SIBLING_WINDOW_MS)),
      lte(sessions.scheduledStart, new Date(start + SIBLING_WINDOW_MS))
    ),
    orderBy: [asc(sessions.scheduledStart), asc(sessions.id)],
  });

  const canonical = siblings[0] ?? session;
  return { kind: "openable", session: canonical };
}

/**
 * True when this user may open the room for a class that hasn't started —
 * anyone actually attending it. Deliberately not teacher-only: a student who
 * shows up early should be able to sit in the room and be found there.
 */
export function mayOpenRoom(isTeacher: boolean, isStudent: boolean): boolean {
  return isTeacher || isStudent;
}

/** Kept for callers that only care whether *something* of this teacher's is up. */
export async function findLiveSessionForTeacher(teacherId: string) {
  return db.query.sessions.findFirst({
    where: and(
      eq(sessions.teacherId, teacherId),
      eq(sessions.status, "IN_PROGRESS"),
      or(gt(sessions.actualStart, new Date(Date.now() - LIVE_WINDOW_MS)))
    ),
    orderBy: [asc(sessions.actualStart)],
    columns: { id: true },
  });
}
