/**
 * @fileoverview The numbers on the admin overview, and the lists beside them.
 *
 * The overview used to count every student profile ever created as "Active
 * Students" and bucket "today" by the server's midnight, which on a UTC host
 * is the middle of the afternoon for a school in North America. Every figure
 * here says what it counts, and every day/week/month boundary is the viewer's.
 *
 * A class is an occurrence, not a row: a group class is a group row plus one
 * INDIVIDUAL row per student (lib/class-room.ts). Counting rows would show a
 * class of three as three classes. Where the rows are few (one week) they are
 * grouped with the same `groupIntoOccurrences` the join API uses; where an
 * aggregate is needed, a class is one distinct (teacher, start) pair, which
 * matches the grouping for everything booked through the normal flows.
 *
 * Merged rows (`mergedIntoId` set) are CANCELLED placeholders for a class that
 * moved, so they are left out of every count — including "cancelled".
 *
 * Live-room counts are not here: they come from lib/admin-live.ts, so the
 * overview's "Live now" figure and its live panel can never disagree.
 *
 * @module lib/admin-metrics
 */

import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bookings, invoices, sessions, studentProfiles, users } from "@/db/schema";
import { orgFilter, type AdminContext } from "@/lib/admin-page";
import { getAttendanceStats } from "@/lib/attendance";
import { zonedDayParts, zonedWallClockToInstant } from "@/lib/slots";
import { groupIntoOccurrences } from "@/lib/class-room";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export interface ZonedCalendar {
  dayStart: Date;
  dayEnd: Date;
  /** Monday 00:00 of this week. */
  weekStart: Date;
  weekEnd: Date;
  monthStart: Date;
}

/** Midnight `offsetDays` from the given calendar date, in `zone`. */
function midnight(y: number, m: number, d: number, offsetDays: number, zone: string): Date {
  // Date.UTC normalises day overflow (Oct 32 → Nov 1); read the parts back
  // before asking for that wall clock in the zone.
  const t = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return zonedWallClockToInstant(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 0, 0, zone);
}

/** Today, this week (Monday first) and this month, as instants, in `zone`. */
export function zonedCalendar(now: Date, zone: string): ZonedCalendar {
  const { y, m, d, weekday } = zonedDayParts(now, zone);
  const fromMonday = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].indexOf(weekday);
  return {
    dayStart: midnight(y, m, d, 0, zone),
    dayEnd: midnight(y, m, d, 1, zone),
    weekStart: midnight(y, m, d, -fromMonday, zone),
    weekEnd: midnight(y, m, d, 7 - fromMonday, zone),
    monthStart: zonedWallClockToInstant(y, m, 1, 0, 0, zone),
  };
}

/** One currency's total. Invoices can be in more than one currency, so sums never mix them. */
export interface MoneyTotal {
  currency: string;
  cents: number;
}

export interface AdminOverview {
  timeZone: string;
  classesToday: number;
  classesThisWeek: number;
  cancelledThisWeek: number;
  /** Distinct students with a non-cancelled booking in the last 30 days or upcoming. */
  activeStudents: number;
  teachers: number;
  /** "87%", or "--" when nothing was expected. Counts from lib/attendance.ts. */
  attendanceRate: string;
  attendanceExpected: number;
  noShows30d: number;
  openInvoices: number;
  overdueInvoices: number;
  overdueAmount: MoneyTotal[];
  paidThisMonth: MoneyTotal[];
  /** Trial classes booked and not yet held (origin TRIAL, SCHEDULED, in the future). */
  upcomingTrials: number;
}

/** A class key for SQL aggregates — see the module comment. */
const occurrenceKey = sql`${sessions.teacherId} || '|' || ${sessions.scheduledStart}::text`;

/**
 * Every figure on the overview, in one round of parallel queries.
 *
 * @param timeZone - the viewer's IANA zone; "UTC" when it can't be known
 */
export async function getAdminOverview(ctx: AdminContext, timeZone: string): Promise<AdminOverview> {
  const now = new Date();
  const cal = zonedCalendar(now, timeZone);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);
  const org = (column: Parameters<typeof orgFilter>[1]) => orgFilter(ctx, column);

  // Same literal-then-cast as lib/attendance.ts: the columns are `timestamp`
  // without zone and hold UTC.
  const overdueSql = sql`(${invoices.status} = 'OVERDUE' or (${invoices.status} = 'OPEN' and ${invoices.dueDate} < ${now.toISOString()}::timestamp))`;

  const [weekRows, [students], [teachers], attendance, [noShows], invoiceRows, paidRows, [trials]] =
    await Promise.all([
      db
        .select({ id: sessions.id, teacherId: sessions.teacherId, scheduledStart: sessions.scheduledStart, status: sessions.status })
        .from(sessions)
        .where(
          and(
            org(sessions.orgId),
            gte(sessions.scheduledStart, cal.weekStart),
            lt(sessions.scheduledStart, cal.weekEnd),
            isNull(sessions.mergedIntoId)
          )
        ),
      db
        .select({ n: sql<number>`count(distinct coalesce(${bookings.studentProfileId}, ${bookings.userId}))::int` })
        .from(bookings)
        .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
        .where(
          and(
            org(bookings.orgId),
            ne(bookings.status, "CANCELLED"),
            ne(sessions.status, "CANCELLED"),
            gte(sessions.scheduledStart, thirtyDaysAgo)
          )
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(users)
        .where(and(org(users.orgId), eq(users.role, "TEACHER"), isNull(users.deletedAt))),
      getAttendanceStats({
        orgId: ctx.isSuperAdmin ? undefined : ctx.orgId,
        from: thirtyDaysAgo,
        to: now,
      }),
      db
        .select({ n: sql<number>`count(distinct ${occurrenceKey})::int` })
        .from(sessions)
        .where(
          and(
            org(sessions.orgId),
            eq(sessions.status, "NO_SHOW"),
            gte(sessions.scheduledStart, thirtyDaysAgo),
            lt(sessions.scheduledStart, now),
            isNull(sessions.mergedIntoId)
          )
        ),
      db
        .select({
          currency: invoices.currency,
          open: sql<number>`count(*)::int`,
          overdue: sql<number>`count(*) filter (where ${overdueSql})::int`,
          overdueCents: sql<number>`coalesce(sum(${invoices.amountDueCents} - ${invoices.amountPaidCents}) filter (where ${overdueSql}), 0)`.mapWith(Number),
        })
        .from(invoices)
        .where(and(org(invoices.orgId), inArray(invoices.status, ["OPEN", "OVERDUE"])))
        .groupBy(invoices.currency),
      db
        .select({ currency: invoices.currency, cents: sql<number>`coalesce(sum(${invoices.amountPaidCents}), 0)`.mapWith(Number) })
        .from(invoices)
        .where(and(org(invoices.orgId), eq(invoices.status, "PAID"), gte(invoices.paidAt, cal.monthStart)))
        .groupBy(invoices.currency),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(sessions)
        .where(
          and(
            org(sessions.orgId),
            eq(sessions.origin, "TRIAL"),
            eq(sessions.status, "SCHEDULED"),
            gte(sessions.scheduledStart, now),
            isNull(sessions.mergedIntoId)
          )
        ),
    ]);

  const held = weekRows.filter((r) => r.status !== "CANCELLED");
  const cancelled = weekRows.filter((r) => r.status === "CANCELLED");
  const today = held.filter((r) => r.scheduledStart >= cal.dayStart && r.scheduledStart < cal.dayEnd);

  return {
    timeZone,
    classesToday: groupIntoOccurrences(today).length,
    classesThisWeek: groupIntoOccurrences(held).length,
    cancelledThisWeek: groupIntoOccurrences(cancelled).length,
    activeStudents: students?.n ?? 0,
    teachers: teachers?.n ?? 0,
    // Not `attendance.attendanceRate`: that reads "--" when nobody attended,
    // which hides a 0% that an operator needs to see.
    attendanceRate:
      attendance.expected > 0 ? `${Math.round((attendance.attended / attendance.expected) * 100)}%` : "--",
    attendanceExpected: attendance.expected,
    noShows30d: noShows?.n ?? 0,
    openInvoices: invoiceRows.reduce((s, r) => s + r.open, 0),
    overdueInvoices: invoiceRows.reduce((s, r) => s + r.overdue, 0),
    overdueAmount: invoiceRows.filter((r) => r.overdueCents > 0).map((r) => ({ currency: r.currency, cents: r.overdueCents })),
    paidThisMonth: paidRows.filter((r) => r.cents > 0).map((r) => ({ currency: r.currency, cents: r.cents })),
    upcomingTrials: trials?.n ?? 0,
  };
}

// ─── Lists ──────────────────────────────────────────────────────────────────

export interface OverviewClass {
  sessionId: string;
  title: string;
  status: string;
  /** ISO */
  scheduledStart: string;
  scheduledEnd: string;
  /** ISO. Scheduled end plus any extension the teacher added. */
  endsAt: string;
  teacherName: string;
  students: string[];
  isTrial: boolean;
}

/**
 * Classes from `from` to `to`, one entry per occurrence, with their students.
 * Shared by the Today panel and the needs-attention checks so both see the
 * same rows.
 */
async function loadClasses(
  ctx: AdminContext,
  where: ReturnType<typeof and>
): Promise<OverviewClass[]> {
  const rows = await db
    .select({
      id: sessions.id,
      teacherId: sessions.teacherId,
      title: sessions.title,
      status: sessions.status,
      origin: sessions.origin,
      scheduledStart: sessions.scheduledStart,
      scheduledEnd: sessions.scheduledEnd,
      extensionMin: sessions.extensionMin,
      teacherName: users.name,
      teacherEmail: users.email,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.teacherId, users.id))
    .where(and(orgFilter(ctx, sessions.orgId), isNull(sessions.mergedIntoId), ne(sessions.status, "CANCELLED"), where))
    .orderBy(sessions.scheduledStart)
    .limit(300);
  if (rows.length === 0) return [];

  const roster = await db
    .select({ sessionId: bookings.sessionId, profileName: studentProfiles.name, userName: users.name })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .leftJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
    .where(and(inArray(bookings.sessionId, rows.map((r) => r.id)), ne(bookings.status, "CANCELLED")));

  return groupIntoOccurrences(rows).map(({ canonical, sessions: group }) => {
    const ids = new Set(group.map((s) => s.id));
    const students = [
      ...new Set(roster.filter((b) => ids.has(b.sessionId)).map((b) => b.profileName || b.userName || "Student")),
    ];
    return {
      sessionId: canonical.id,
      title: canonical.title || "Class",
      // A class is running if any of its rows is; otherwise the canonical row speaks for it.
      status: group.some((s) => s.status === "IN_PROGRESS") ? "IN_PROGRESS" : canonical.status,
      scheduledStart: canonical.scheduledStart.toISOString(),
      scheduledEnd: canonical.scheduledEnd.toISOString(),
      endsAt: new Date(
        Math.max(...group.map((s) => s.scheduledEnd.getTime() + (s.extensionMin ?? 0) * MINUTE))
      ).toISOString(),
      teacherName: canonical.teacherName || canonical.teacherEmail,
      students: students.sort((a, b) => a.localeCompare(b)),
      isTrial: group.some((s) => s.origin === "TRIAL"),
    };
  });
}

/** Today's classes that have not finished yet, in the viewer's day. */
export async function getTodayRemaining(ctx: AdminContext, timeZone: string): Promise<OverviewClass[]> {
  const now = new Date();
  const { dayStart, dayEnd } = zonedCalendar(now, timeZone);
  const classes = await loadClasses(
    ctx,
    and(gte(sessions.scheduledStart, dayStart), lt(sessions.scheduledStart, dayEnd))
  );
  return classes.filter(
    (c) => c.status === "IN_PROGRESS" || (c.status === "SCHEDULED" && new Date(c.endsAt) > now)
  );
}

export interface AttentionSessions {
  /** Still SCHEDULED more than 10 minutes after start, and not yet due to end. */
  notStarted: OverviewClass[];
  /** IN_PROGRESS more than 15 minutes past the scheduled end (extensions included). */
  overrunning: OverviewClass[];
  /** SCHEDULED to start within the next two hours. */
  startingSoon: OverviewClass[];
}

const NOT_STARTED_GRACE = 10 * MINUTE;
const OVERRUN_GRACE = 15 * MINUTE;

/** Sessions an operator should look at now. Each list is computed from session rows only. */
export async function getAttentionSessions(ctx: AdminContext): Promise<AttentionSessions> {
  const now = Date.now();
  const twoHours = new Date(now + 2 * 60 * MINUTE);
  // An IN_PROGRESS row from days ago is a class nobody closed, and it belongs
  // here too — so the lower bound is a week, not today.
  const weekAgo = new Date(now - 7 * DAY);

  const classes = await loadClasses(
    ctx,
    and(
      gte(sessions.scheduledStart, weekAgo),
      lt(sessions.scheduledStart, twoHours),
      or(eq(sessions.status, "SCHEDULED"), eq(sessions.status, "IN_PROGRESS"))
    )
  );

  const startMs = (c: OverviewClass) => new Date(c.scheduledStart).getTime();
  const endMs = (c: OverviewClass) => new Date(c.endsAt).getTime();

  return {
    notStarted: classes.filter(
      (c) => c.status === "SCHEDULED" && startMs(c) < now - NOT_STARTED_GRACE && endMs(c) > now
    ),
    overrunning: classes.filter((c) => c.status === "IN_PROGRESS" && endMs(c) < now - OVERRUN_GRACE),
    startingSoon: classes.filter((c) => c.status === "SCHEDULED" && startMs(c) >= now),
  };
}
