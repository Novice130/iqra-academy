/**
 * @fileoverview Turning a teacher's weekly hours into bookable moments.
 *
 * ── The one rule ────────────────────────────────────────────────────────────
 * A recurring availability row is **wall-clock in the teacher's zone**. It is
 * converted to an absolute instant once per occurrence, at generation time,
 * and never converted once and reused.
 *
 * That single sentence is the whole DST answer:
 *
 *   - "Monday 18:00 Asia/Kolkata" is 12:30 UTC every Monday of the year,
 *     because India has no DST.
 *   - A student in America/Chicago sees that same instant as 7:30 AM CDT in
 *     July and 6:30 AM CST in January. Nothing here knows about the US
 *     transition — the browser applies each date's own rules to each instant.
 *     It falls out for free.
 *   - Conversely "Monday 18:00 America/Chicago" is 23:00 UTC in summer and
 *     00:00 UTC (Tuesday!) in winter. This is why per-occurrence conversion is
 *     mandatory: cache one offset and half the year is an hour wrong.
 *
 * Once a slot is booked it becomes `sessions.scheduledStart`, a frozen
 * instant, and a later DST change does not move it. That is correct — the
 * class was agreed for a moment in time, not for a wall-clock reading.
 *
 * ── Why Intl and not a date library ─────────────────────────────────────────
 * date-fns v4 does zone work through `@date-fns/tz`, which is not installed.
 * The conversion needed here is one operation and about thirty lines, the
 * Worker has a documented 128 MB memory ceiling (see lib/db.ts on the error
 * 1102 incidents), and `Intl` is already how LocalTime.tsx and
 * api/me/timezone do this. Adding a package to avoid thirty lines is the wrong
 * trade here.
 *
 * @module lib/slots
 */

import { db } from "./db";
import { and, eq, gte, inArray, lt, or } from "drizzle-orm";
import { sessions, teacherAvailability, teacherTimeOff, users } from "@/db/schema";

export type DayOfWeek =
  | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY"
  | "FRIDAY" | "SATURDAY" | "SUNDAY";

const WEEKDAYS: DayOfWeek[] = [
  "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
];

export interface Slot {
  teacherId: string;
  teacherName: string;
  /** So the UI can say "…and 4:30 AM for your teacher". */
  teacherTimeZone: string;
  startsAt: Date;
  endsAt: Date;
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/**
 * How far `zone` is from UTC, in minutes, at a given instant.
 *
 * Formats the instant in the target zone, reads the parts back as if they were
 * UTC, and takes the difference. Ugly, exact, and dependency-free.
 */
export function zoneOffsetMinutes(instant: Date, zone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(instant)) p[type] = value;
  // Intl renders midnight as hour 24 in some engines.
  const hour = p.hour === "24" ? "00" : p.hour;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(hour), Number(p.minute), Number(p.second)
  );
  return Math.round((asUtc - instant.getTime()) / MINUTE);
}

/**
 * The instant at which the wall clock in `zone` reads the given date and time.
 *
 * Two passes: guess using the offset at the naive instant, then re-resolve
 * using the offset that actually applies at the candidate. One pass is wrong
 * whenever the guess lands on the far side of a transition from the answer.
 *
 * DST EDGE CASES, and what this does about them:
 *   - **Spring forward.** 2:30 AM on a US transition date does not exist. The
 *     resolver lands on 3:30 AM. A slot moves forward one hour, once a year,
 *     for zones that observe DST. Callers that care can detect it by
 *     converting back (see `wallClockRoundTrips`).
 *   - **Fall back.** 1:30 AM happens twice. This returns the first, pre-
 *     transition occurrence. Also once a year, also an hour.
 * Both are acceptable for a school that teaches in the evening. Both are
 * written down here so nobody "fixes" them into something worse.
 */
export function zonedWallClockToInstant(
  y: number, m: number, d: number, hh: number, mm: number, zone: string
): Date {
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const guess = new Date(naive - zoneOffsetMinutes(new Date(naive), zone) * MINUTE);
  const refined = new Date(naive - zoneOffsetMinutes(guess, zone) * MINUTE);
  return refined;
}

/** The calendar date and weekday an instant falls on, in a given zone. */
export function zonedDayParts(
  instant: Date, zone: string
): { y: number; m: number; d: number; weekday: DayOfWeek } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(instant)) p[type] = value;
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    weekday: WEEKDAYS[idx < 0 ? 0 : idx],
  };
}

/**
 * Did the wall-clock time survive the round trip?
 *
 * False means the requested reading does not exist in that zone on that date —
 * the spring-forward gap. Used to drop rather than silently shift a slot.
 */
export function wallClockRoundTrips(
  instant: Date, zone: string, hh: number, mm: number
): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, hour12: false, hour: "2-digit", minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(instant)) p[type] = value;
  const hour = p.hour === "24" ? 0 : Number(p.hour);
  return hour === hh && Number(p.minute) === mm;
}

const toMinutes = (t: string) => {
  const [h, m] = t.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
};

interface AvailabilityRow {
  teacherId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  timezone: string;
  slotMinutes: number;
}

/**
 * Expand weekly ranges into concrete instants across a window.
 *
 * Pure — no database, so it is directly testable. `generateSlots` below is the
 * thin wrapper that feeds it.
 */
export function expandAvailability(
  rows: AvailabilityRow[],
  names: Map<string, string>,
  from: Date,
  to: Date
): Slot[] {
  const out: Slot[] = [];

  const byTeacher = new Map<string, AvailabilityRow[]>();
  for (const r of rows) {
    const list = byTeacher.get(r.teacherId) ?? [];
    list.push(r);
    byTeacher.set(r.teacherId, list);
  }

  for (const [teacherId, teacherRows] of byTeacher) {
    const zone = teacherRows[0].timezone;

    // Walk calendar days in the TEACHER'S zone, not in UTC. Walking in UTC is
    // the classic bug: for Pacific/Auckland the UTC weekday is frequently the
    // wrong day, so a Monday range would be generated on Sundays.
    // Start a day early and end a day late so a range that straddles midnight
    // UTC is not clipped at either edge.
    for (let cursor = from.getTime() - DAY; cursor <= to.getTime() + DAY; cursor += DAY) {
      const { y, m, d, weekday } = zonedDayParts(new Date(cursor), zone);

      for (const row of teacherRows) {
        if (row.dayOfWeek !== weekday) continue;

        const startMin = toMinutes(row.startTime);
        const endMin = toMinutes(row.endTime);
        const step = row.slotMinutes || 30;

        for (let mins = startMin; mins + step <= endMin; mins += step) {
          const hh = Math.floor(mins / 60);
          const mm = mins % 60;
          const startsAt = zonedWallClockToInstant(y, m, d, hh, mm, zone);

          // A reading inside a spring-forward gap does not exist. Dropping it
          // is honest; shifting it silently books a class an hour off.
          if (!wallClockRoundTrips(startsAt, zone, hh, mm)) continue;
          if (startsAt < from || startsAt >= to) continue;

          const endsAt = new Date(startsAt.getTime() + step * MINUTE);
          out.push({
            teacherId,
            teacherName: names.get(teacherId) ?? "Teacher",
            teacherTimeZone: zone,
            startsAt,
            endsAt,
          });
        }
      }
    }
  }

  // The ±1 day of overscan can produce the same instant twice where two ranges
  // touch. Dedupe on teacher + instant.
  const seen = new Set<string>();
  return out
    .filter((s) => {
      const key = `${s.teacherId}@${s.startsAt.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.teacherId.localeCompare(b.teacherId));
}

export interface GenerateSlotsOptions {
  orgId: string;
  /** Omit for every active teacher in the org. */
  teacherId?: string;
  from?: Date;
  to?: Date;
  /** Never offer a slot that starts sooner than this. Default 2 hours. */
  minLeadMinutes?: number;
}

/**
 * Bookable slots, with everything already busy subtracted.
 *
 * Reads only, no transaction — callers should use `withHttpDb`.
 */
export async function generateSlots(opts: GenerateSlotsOptions): Promise<Slot[]> {
  const minLead = opts.minLeadMinutes ?? 120;
  const from = new Date(
    Math.max((opts.from ?? new Date()).getTime(), Date.now() + minLead * MINUTE)
  );
  const to = opts.to ?? new Date(Date.now() + 28 * DAY);
  if (to <= from) return [];

  const whereConditions = [eq(teacherAvailability.isActive, true)];
  if (opts.orgId) {
    whereConditions.push(eq(teacherAvailability.orgId, opts.orgId));
  }
  if (opts.teacherId) {
    whereConditions.push(eq(teacherAvailability.teacherId, opts.teacherId));
  }

  const rows = await db
    .select({
      teacherId: teacherAvailability.teacherId,
      dayOfWeek: teacherAvailability.dayOfWeek,
      startTime: teacherAvailability.startTime,
      endTime: teacherAvailability.endTime,
      timezone: teacherAvailability.timezone,
      slotMinutes: teacherAvailability.slotMinutes,
      teacherName: users.name,
      deletedAt: users.deletedAt,
    })
    .from(teacherAvailability)
    .innerJoin(users, eq(users.id, teacherAvailability.teacherId))
    .where(and(...whereConditions));

  const live = rows.filter((r) => r.deletedAt === null);
  if (live.length === 0) return [];

  const names = new Map(live.map((r) => [r.teacherId, r.teacherName ?? "Teacher"]));
  let slots = expandAvailability(live as AvailabilityRow[], names, from, to);
  if (slots.length === 0) return [];

  const teacherIds = [...new Set(live.map((r) => r.teacherId))];

  // Anything already on the calendar takes the slot off the table. The legacy
  // group-row-plus-individual-row shape self-dedupes here, because every row
  // for one class overlaps the same slot.
  const busy = await db
    .select({
      teacherId: sessions.teacherId,
      start: sessions.scheduledStart,
      end: sessions.scheduledEnd,
    })
    .from(sessions)
    .where(
      and(
        inArray(sessions.teacherId, teacherIds),
        inArray(sessions.status, ["SCHEDULED", "IN_PROGRESS"]),
        lt(sessions.scheduledStart, to),
        gte(sessions.scheduledEnd, from)
      )
    );

  const off = await db
    .select({
      teacherId: teacherTimeOff.teacherId,
      start: teacherTimeOff.startsAt,
      end: teacherTimeOff.endsAt,
    })
    .from(teacherTimeOff)
    .where(
      and(
        inArray(teacherTimeOff.teacherId, teacherIds),
        lt(teacherTimeOff.startsAt, to),
        gte(teacherTimeOff.endsAt, from)
      )
    );

  const blocks = [...busy, ...off];
  if (blocks.length > 0) {
    slots = slots.filter(
      (s) =>
        !blocks.some(
          (b) =>
            b.teacherId === s.teacherId &&
            s.startsAt < b.end &&
            s.endsAt > b.start
        )
    );
  }

  return slots;
}

/**
 * Is this exact instant genuinely on offer?
 *
 * The booking routes call this instead of trusting a start time from the
 * client. Without it, any authenticated user can book any teacher at 3 AM by
 * POSTing a raw ISO string.
 */
export async function findOfferedSlot(
  orgId: string,
  teacherId: string,
  startsAt: Date,
  minLeadMinutes?: number
): Promise<Slot | null> {
  // The lead time is deliberately NOT waived here. A slot too close to now is
  // not on offer, and a booking route that skipped this check would be the
  // way somebody books a class starting in five minutes.
  const slots = await generateSlots({
    orgId,
    teacherId,
    from: new Date(startsAt.getTime() - MINUTE),
    to: new Date(startsAt.getTime() + MINUTE),
    minLeadMinutes,
  });
  return slots.find((s) => s.startsAt.getTime() === startsAt.getTime()) ?? null;
}
