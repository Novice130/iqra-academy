/**
 * @fileoverview How long a phone may wait before asking again.
 *
 * The mobile app used to poll `students/live-class` every 15s and
 * `calls/incoming` every 2.5s for as long as it was open — ~28 requests a
 * minute from a handset sitting on a bedside table with no class booked until
 * Thursday. The answer to both questions is almost always "nothing", and the
 * server is the only party that knows *when it could next stop being nothing*.
 * So it says so, and the phone sleeps until then.
 *
 * Both cadences are decided here and both ride on the `live-class` response.
 * That is deliberate: `calls/incoming` is the frequent endpoint, and giving it
 * a schedule lookup of its own would have added a query to the very request
 * this file exists to make rarer. The infrequent poll tells the frequent one
 * how fast to run.
 *
 * Every number is advisory. A client that ignores the hint keeps working
 * exactly as it did.
 */

import { and, asc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, sessions } from "@/db/schema";

export type PollCadence = {
  /** Seconds until the phone should ask `students/live-class` again. */
  liveSeconds: number;
  /** Seconds between `calls/incoming` polls until the next `live-class` answer. */
  ringSeconds: number;
};

/**
 * How long before a booked start the slot counts as "about to happen".
 *
 * Anyone may open the room an hour early (`EARLY_JOIN_MS` in `class-room.ts`),
 * but a teacher who is going to be early is usually minutes early, not an
 * hour. Ten minutes of fast polling either side of the start is what makes the
 * ribbon feel instant on the only occasions anybody is watching for it.
 */
const HOT_LEAD_MS = 10 * 60 * 1000;

/** Nothing booked at all. Half an hour is still 48 checks a day. */
const IDLE_LIVE_SECONDS = 1800;

/**
 * Never sleep longer than this even with the next class days away.
 * A class can be booked, moved, or started ad-hoc while the phone is asleep,
 * and this is the ceiling on how stale the schedule itself may get.
 */
const MAX_SLEEP_SECONDS = 900;

/**
 * Fast enough that a teacher pressing "End class" is off the student's screen
 * before they wonder why it is still there — and 20x slower than the ring poll,
 * because a class ending is not an event you must catch in the same second.
 */
const IN_CLASS_LIVE_SECONDS = 30;

/** In the slot. The teacher may connect at any moment. */
const HOT_LIVE_SECONDS = 15;

/**
 * The floor on the ring poll, used whenever a ring is plausible right now.
 * `calls/incoming` only surfaces invites from the last 60s, so this is about
 * how fast the phone rings, not whether it rings at all.
 */
const HOT_RING_SECONDS = 2.5;

/**
 * Idle ring cadence. Not zero, because a teacher's ad-hoc "Call Now" is not
 * tied to a booked slot and must still reach a student who has nothing on
 * their calendar. Twice as slow as ringing in a class window; the real fix is
 * push, which retires this path entirely.
 */
const IDLE_RING_SECONDS = 5;

/**
 * The caller's next class that has not finished yet, soonest first.
 *
 * Booked-and-not-cancelled on both sides: a cancelled booking against a live
 * session, or a confirmed booking against a cancelled session, are both "not
 * expected in a room" and neither should hold the phone at a fast cadence.
 */
async function nextBookedStart(userId: string): Promise<Date | null> {
  const rows = await db
    .select({ scheduledStart: sessions.scheduledStart })
    .from(bookings)
    .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
    .where(
      and(
        eq(bookings.userId, userId),
        ne(bookings.status, "CANCELLED"),
        ne(sessions.status, "CANCELLED"),
        ne(sessions.status, "COMPLETED"),
        gt(sessions.scheduledEnd, new Date())
      )
    )
    .orderBy(asc(sessions.scheduledStart))
    .limit(1);

  return rows[0]?.scheduledStart ?? null;
}

/**
 * Decide both cadences for one caller.
 *
 * `isLive` short-circuits the schedule query — when a class is already running
 * there is nothing to look up, and that is the one state where this function
 * is called often.
 */
export async function pollCadenceFor(userId: string, isLive: boolean): Promise<PollCadence> {
  if (isLive) {
    return { liveSeconds: IN_CLASS_LIVE_SECONDS, ringSeconds: HOT_RING_SECONDS };
  }

  const nextStart = await nextBookedStart(userId);
  if (!nextStart) {
    return { liveSeconds: IDLE_LIVE_SECONDS, ringSeconds: IDLE_RING_SECONDS };
  }

  const now = Date.now();
  const hotAt = nextStart.getTime() - HOT_LEAD_MS;

  // Inside the window. `nextBookedStart` already dropped anything that has
  // finished, so "past the lead time" means the slot is happening now.
  if (now >= hotAt) {
    return { liveSeconds: HOT_LIVE_SECONDS, ringSeconds: HOT_RING_SECONDS };
  }

  const untilHot = Math.ceil((hotAt - now) / 1000);
  return {
    liveSeconds: Math.max(HOT_LIVE_SECONDS, Math.min(untilHot, MAX_SLEEP_SECONDS)),
    ringSeconds: IDLE_RING_SECONDS,
  };
}

/** The answer to give when the cadence lookup itself failed. */
export const FALLBACK_CADENCE: PollCadence = {
  liveSeconds: HOT_LIVE_SECONDS,
  ringSeconds: HOT_RING_SECONDS,
};
