/**
 * @fileoverview Read models for /admin/teachers and /admin/teachers/[id].
 *
 * Two rules every number here follows, because getting either wrong produces
 * a figure an admin would pay a teacher by:
 *
 *   1. **A class is an occurrence, not a session row.** A class of three is a
 *      group row plus one row per student. Counts go through
 *      `groupIntoOccurrences` (lib/class-room.ts) or `getAttendanceReport`
 *      (lib/attendance.ts), which use the same rule as the join API.
 *   2. **Hours are what the room recorded,** the sum of the teacher's own
 *      closed attendance connections (role TEACHER), never the scheduled
 *      length. A class the teacher never joined is zero hours.
 *
 * Day, week and month boundaries are taken in the zone the caller passes —
 * the admin's — so "this week" means the admin's week. Weeks start on Sunday,
 * the same as /admin/teacher-schedules.
 *
 * @module lib/admin-teachers
 */

import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bookings,
  defaultWeeklySlots,
  sessionAttendance,
  sessions,
  studentProfiles,
  teacherAvailability,
  teacherTimeOff,
  users,
} from "@/db/schema";
import { orgFilter, type AdminContext } from "@/lib/admin-page";
import { groupIntoOccurrences } from "@/lib/class-room";
import { getAttendanceReport, type AttendanceOccurrence } from "@/lib/attendance";
import { zonedDayParts, zonedWallClockToInstant, type DayOfWeek } from "@/lib/slots";
import { TEACHING_ROLES, type UserRole } from "@/lib/roles";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_INDEX: Record<DayOfWeek, number> = {
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};
const UPCOMING_STATUSES = ["SCHEDULED", "IN_PROGRESS"] as const;

// ─── Windows ────────────────────────────────────────────────────────────────

export interface Window {
  from: Date;
  to: Date;
}

/** Sunday 00:00 to the next Sunday 00:00, in `zone`, around `now`. */
export function weekWindow(now: Date, zone: string): Window {
  const { y, m, d, weekday } = zonedDayParts(now, zone);
  const start = d - WEEKDAY_INDEX[weekday];
  return {
    from: zonedWallClockToInstant(y, m, start, 0, 0, zone),
    to: zonedWallClockToInstant(y, m, start + 7, 0, 0, zone),
  };
}

/** "YYYY-MM" of the month `now` falls in, in `zone`. */
export function monthKey(now: Date, zone: string): string {
  const { y, m } = zonedDayParts(now, zone);
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Parses "YYYY-MM"; null for anything else. */
export function parseMonthKey(value: string | undefined | null): { y: number; m: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? "");
  return match ? { y: Number(match[1]), m: Number(match[2]) } : null;
}

/** Shift a "YYYY-MM" key by whole months. */
export function shiftMonthKey(key: string, delta: number): string {
  const p = parseMonthKey(key);
  if (!p) return key;
  const total = p.y * 12 + (p.m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** The first instant of the month to the first instant of the next, in `zone`. */
export function monthWindow(key: string, zone: string): Window {
  const p = parseMonthKey(key) ?? { y: 1970, m: 1 };
  return {
    from: zonedWallClockToInstant(p.y, p.m, 1, 0, 0, zone),
    to: zonedWallClockToInstant(p.y, p.m + 1, 1, 0, 0, zone),
  };
}

// ─── List ───────────────────────────────────────────────────────────────────

export interface TeacherListRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  timezone: string | null;
  activeStudents: number;
  classesThisWeek: number;
  secondsLast30: number;
  noShowsLast30: number;
  nextTimeOff: { startsAt: string; endsAt: string; reason: string | null } | null;
  /** The next time off has already started. Decided here so server and client agree. */
  awayNow: boolean;
}

function addTo(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

/**
 * Everyone who teaches in the admin's scope, with this week's and the last
 * 30 days' numbers. Admins are listed only when they actually teach — they
 * have availability, students, or classes in the window — so the list isn't
 * padded with every administrator in the org.
 */
export async function loadTeacherList(admin: AdminContext, zone: string, now = new Date()): Promise<TeacherListRow[]> {
  const teachers = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, timezone: users.timezone })
    .from(users)
    .where(and(inArray(users.role, TEACHING_ROLES), isNull(users.deletedAt), orgFilter(admin, users.orgId)))
    .orderBy(asc(users.name));
  if (teachers.length === 0) return [];

  const ids = teachers.map((t) => t.id);
  const week = weekWindow(now, zone);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const from = since30 < week.from ? since30 : week.from;

  const [sessionRows, hourRows, bookedRows, slotRows, timeOffRows, availRows] = await Promise.all([
    db
      .select({ id: sessions.id, teacherId: sessions.teacherId, scheduledStart: sessions.scheduledStart, status: sessions.status })
      .from(sessions)
      .where(
        and(
          inArray(sessions.teacherId, ids),
          gte(sessions.scheduledStart, from),
          lt(sessions.scheduledStart, week.to),
          isNull(sessions.mergedIntoId),
          ne(sessions.status, "CANCELLED"),
          orgFilter(admin, sessions.orgId)
        )
      ),
    db
      .select({
        teacherId: sessions.teacherId,
        seconds: sql<number>`coalesce(sum(${sessionAttendance.durationSeconds}), 0)::int`.mapWith(Number),
      })
      .from(sessionAttendance)
      .innerJoin(sessions, eq(sessionAttendance.sessionId, sessions.id))
      .where(
        and(
          eq(sessionAttendance.role, "TEACHER"),
          inArray(sessions.teacherId, ids),
          gte(sessions.scheduledStart, since30),
          lt(sessions.scheduledStart, now),
          isNull(sessions.mergedIntoId),
          orgFilter(admin, sessions.orgId)
        )
      )
      .groupBy(sessions.teacherId),
    db
      .selectDistinct({ teacherId: sessions.teacherId, profileId: bookings.studentProfileId })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .where(
        and(
          inArray(sessions.teacherId, ids),
          gte(sessions.scheduledStart, now),
          inArray(sessions.status, [...UPCOMING_STATUSES]),
          isNull(sessions.mergedIntoId),
          ne(bookings.status, "CANCELLED"),
          isNotNull(bookings.studentProfileId),
          orgFilter(admin, sessions.orgId)
        )
      ),
    db
      .select({ teacherId: defaultWeeklySlots.teacherId, profileId: defaultWeeklySlots.studentProfileId })
      .from(defaultWeeklySlots)
      .where(
        and(
          inArray(defaultWeeklySlots.teacherId, ids),
          eq(defaultWeeklySlots.isActive, true),
          orgFilter(admin, defaultWeeklySlots.orgId)
        )
      ),
    db
      .select({
        teacherId: teacherTimeOff.teacherId,
        startsAt: teacherTimeOff.startsAt,
        endsAt: teacherTimeOff.endsAt,
        reason: teacherTimeOff.reason,
      })
      .from(teacherTimeOff)
      .where(and(inArray(teacherTimeOff.teacherId, ids), gte(teacherTimeOff.endsAt, now), orgFilter(admin, teacherTimeOff.orgId)))
      .orderBy(asc(teacherTimeOff.startsAt)),
    db
      .select({ teacherId: teacherAvailability.teacherId, n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(teacherAvailability)
      .where(
        and(
          inArray(teacherAvailability.teacherId, ids),
          eq(teacherAvailability.isActive, true),
          orgFilter(admin, teacherAvailability.orgId)
        )
      )
      .groupBy(teacherAvailability.teacherId),
  ]);

  const weekCount = new Map<string, number>();
  const noShows = new Map<string, number>();
  for (const occ of groupIntoOccurrences(sessionRows)) {
    const start = occ.canonical.scheduledStart.getTime();
    const tid = occ.canonical.teacherId;
    if (start >= week.from.getTime() && start < week.to.getTime()) addTo(weekCount, tid);
    if (start >= since30.getTime() && start < now.getTime() && occ.canonical.status === "NO_SHOW") addTo(noShows, tid);
  }

  const students = new Map<string, Set<string>>();
  for (const r of [...bookedRows, ...slotRows]) {
    if (!r.profileId) continue;
    const set = students.get(r.teacherId) ?? new Set<string>();
    set.add(r.profileId);
    students.set(r.teacherId, set);
  }

  const seconds = new Map(hourRows.map((r) => [r.teacherId, r.seconds]));
  const hasAvailability = new Set(availRows.filter((r) => r.n > 0).map((r) => r.teacherId));
  const nextOff = new Map<string, TeacherListRow["nextTimeOff"]>();
  for (const t of timeOffRows) {
    if (nextOff.has(t.teacherId)) continue;
    nextOff.set(t.teacherId, { startsAt: t.startsAt.toISOString(), endsAt: t.endsAt.toISOString(), reason: t.reason });
  }

  return teachers
    .map((t) => ({
      id: t.id,
      name: t.name || t.email,
      email: t.email,
      role: t.role,
      timezone: t.timezone,
      activeStudents: students.get(t.id)?.size ?? 0,
      classesThisWeek: weekCount.get(t.id) ?? 0,
      secondsLast30: seconds.get(t.id) ?? 0,
      noShowsLast30: noShows.get(t.id) ?? 0,
      nextTimeOff: nextOff.get(t.id) ?? null,
      awayNow: (nextOff.get(t.id)?.startsAt ?? "9") <= now.toISOString(),
    }))
    .filter(
      (t) =>
        t.role === "TEACHER" ||
        hasAvailability.has(t.id) ||
        t.activeStudents > 0 ||
        t.classesThisWeek > 0 ||
        t.secondsLast30 > 0
    );
}

// ─── Detail ─────────────────────────────────────────────────────────────────

/** The teacher if they are a teaching role, not deleted, and in the admin's scope. */
export async function loadTeacherForAdmin(admin: AdminContext, id: string) {
  const [row] = await db
    .select({
      id: users.id,
      orgId: users.orgId,
      name: users.name,
      email: users.email,
      phone: users.phone,
      timezone: users.timezone,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, id), inArray(users.role, TEACHING_ROLES), isNull(users.deletedAt), orgFilter(admin, users.orgId)))
    .limit(1);
  return row ?? null;
}

export type TeacherRow = NonNullable<Awaited<ReturnType<typeof loadTeacherForAdmin>>>;

/** One class as the teacher pages show it. Instants are ISO strings. */
export interface TeacherClass {
  sessionId: string;
  title: string | null;
  scheduledStart: string | null;
  status: string;
  students: { name: string; status: string }[];
  teacherJoinedAt: string | null;
  teacherLateBySeconds: number | null;
  teacherSeconds: number | null;
  teacherStatus: "PRESENT" | "LATE" | null;
}

export function toTeacherClass(o: AttendanceOccurrence): TeacherClass {
  return {
    sessionId: o.sessionId,
    title: o.title,
    scheduledStart: o.scheduledStart,
    status: o.status,
    students: o.students.map((s) => ({ name: s.name, status: s.status })),
    teacherJoinedAt: o.teacher?.firstJoinedAt ?? null,
    teacherLateBySeconds: o.teacher?.lateBySeconds ?? null,
    teacherSeconds: o.teacher?.durationSeconds ?? null,
    teacherStatus: o.teacher ? (o.teacher.status === "LATE" ? "LATE" : "PRESENT") : null,
  };
}

function inWindow(c: TeacherClass, w: Window): boolean {
  if (!c.scheduledStart) return false;
  const t = new Date(c.scheduledStart).getTime();
  return t >= w.from.getTime() && t < w.to.getTime();
}

export function sumSeconds(classes: TeacherClass[]): number {
  return classes.reduce((sum, c) => sum + (c.teacherSeconds ?? 0), 0);
}

export interface TeacherStats {
  secondsThisMonth: number;
  secondsLastMonth: number;
  completed30: number;
  noShows30: number;
  /** Students who joined, of those booked, over past non-cancelled classes. */
  studentAttendance: { attended: number; expected: number };
  /** Classes the teacher joined within five minutes of the start, of those joined. */
  punctuality: { onTime: number; joined: number };
}

/**
 * Every class the teacher pages need, from as few attendance reads as
 * possible: one covering last month to the end of this week, plus one for the
 * selected month only when it falls outside that.
 */
export async function loadTeacherClasses(teacher: TeacherRow, zone: string, selectedMonth: string, now = new Date()) {
  const thisMonth = monthWindow(monthKey(now, zone), zone);
  const lastMonth = monthWindow(shiftMonthKey(monthKey(now, zone), -1), zone);
  const week = weekWindow(now, zone);
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const span: Window = {
    from: new Date(Math.min(lastMonth.from.getTime(), since30.getTime(), week.from.getTime())),
    to: new Date(Math.max(week.to.getTime(), thisMonth.to.getTime())),
  };

  const report = (w: Window) =>
    getAttendanceReport({ orgId: teacher.orgId, teacherId: teacher.id, from: w.from, to: new Date(w.to.getTime() - 1) });

  const all = (await report(span)).map(toTeacherClass);
  const selected = monthWindow(selectedMonth, zone);
  const covered = selected.from >= span.from && selected.to <= span.to;
  const monthClasses = (covered ? all : (await report(selected)).map(toTeacherClass))
    .filter((c) => inWindow(c, selected))
    .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));

  const past30 = all.filter((c) => inWindow(c, { from: since30, to: now }) && c.status !== "CANCELLED");
  const stats: TeacherStats = {
    secondsThisMonth: sumSeconds(all.filter((c) => inWindow(c, thisMonth))),
    secondsLastMonth: sumSeconds(all.filter((c) => inWindow(c, lastMonth))),
    completed30: past30.filter((c) => c.status === "COMPLETED").length,
    noShows30: past30.filter((c) => c.status === "NO_SHOW").length,
    studentAttendance: {
      expected: past30.reduce((n, c) => n + c.students.length, 0),
      attended: past30.reduce((n, c) => n + c.students.filter((s) => s.status !== "ABSENT").length, 0),
    },
    punctuality: {
      joined: past30.filter((c) => c.teacherStatus).length,
      onTime: past30.filter((c) => c.teacherStatus === "PRESENT").length,
    },
  };

  return {
    stats,
    thisWeek: all
      .filter((c) => inWindow(c, week))
      .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? "")),
    // The report is newest first already.
    recent: all.filter((c) => inWindow(c, { from: span.from, to: now }) && c.status !== "CANCELLED").slice(0, 20),
    month: { key: selectedMonth, classes: monthClasses, seconds: sumSeconds(monthClasses) },
  };
}

export interface RosterStudent {
  profileId: string;
  name: string;
  track: string;
  weeklySlot: { dayOfWeek: DayOfWeek; startTime: string; timezone: string } | null;
  nextClassAt: string | null;
  upcomingClasses: number;
}

/** Students with an active weekly slot or an upcoming booked class with this teacher. */
export async function loadTeacherRoster(teacher: TeacherRow, now = new Date()): Promise<RosterStudent[]> {
  const [slots, upcoming] = await Promise.all([
    db
      .select({
        profileId: studentProfiles.id,
        name: studentProfiles.name,
        track: defaultWeeklySlots.track,
        dayOfWeek: defaultWeeklySlots.dayOfWeek,
        startTime: defaultWeeklySlots.startTime,
        timezone: defaultWeeklySlots.timezone,
      })
      .from(defaultWeeklySlots)
      .innerJoin(studentProfiles, eq(defaultWeeklySlots.studentProfileId, studentProfiles.id))
      .where(
        and(
          eq(defaultWeeklySlots.teacherId, teacher.id),
          eq(defaultWeeklySlots.orgId, teacher.orgId),
          eq(defaultWeeklySlots.isActive, true)
        )
      ),
    db
      .select({
        profileId: studentProfiles.id,
        name: studentProfiles.name,
        track: studentProfiles.track,
        next: sql<Date>`min(${sessions.scheduledStart})`.mapWith(sessions.scheduledStart),
        count: sql<number>`count(distinct ${sessions.id})::int`.mapWith(Number),
      })
      .from(bookings)
      .innerJoin(sessions, eq(bookings.sessionId, sessions.id))
      .innerJoin(studentProfiles, eq(bookings.studentProfileId, studentProfiles.id))
      .where(
        and(
          eq(sessions.teacherId, teacher.id),
          eq(sessions.orgId, teacher.orgId),
          gte(sessions.scheduledStart, now),
          inArray(sessions.status, [...UPCOMING_STATUSES]),
          isNull(sessions.mergedIntoId),
          ne(bookings.status, "CANCELLED")
        )
      )
      .groupBy(studentProfiles.id, studentProfiles.name, studentProfiles.track),
  ]);

  const roster = new Map<string, RosterStudent>();
  for (const u of upcoming) {
    roster.set(u.profileId, {
      profileId: u.profileId,
      name: u.name,
      track: u.track,
      weeklySlot: null,
      nextClassAt: u.next ? new Date(u.next).toISOString() : null,
      upcomingClasses: u.count,
    });
  }
  for (const s of slots) {
    const existing = roster.get(s.profileId);
    const weeklySlot = { dayOfWeek: s.dayOfWeek, startTime: s.startTime.slice(0, 5), timezone: s.timezone };
    if (existing) existing.weeklySlot ??= weeklySlot;
    else roster.set(s.profileId, { profileId: s.profileId, name: s.name, track: s.track, weeklySlot, nextClassAt: null, upcomingClasses: 0 });
  }
  return [...roster.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Active weekly windows, grouped by weekday, in the zone each row was saved in. */
export async function loadTeacherAvailability(teacher: TeacherRow) {
  const rows = await db
    .select({
      dayOfWeek: teacherAvailability.dayOfWeek,
      startTime: teacherAvailability.startTime,
      endTime: teacherAvailability.endTime,
      timezone: teacherAvailability.timezone,
    })
    .from(teacherAvailability)
    .where(
      and(
        eq(teacherAvailability.teacherId, teacher.id),
        eq(teacherAvailability.orgId, teacher.orgId),
        eq(teacherAvailability.isActive, true)
      )
    )
    .orderBy(asc(teacherAvailability.startTime));

  const order: DayOfWeek[] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  return {
    zones: [...new Set(rows.map((r) => r.timezone))],
    days: order
      .map((day) => ({
        day,
        windows: rows
          .filter((r) => r.dayOfWeek === day)
          .map((r) => `${r.startTime.slice(0, 5)}–${r.endTime.slice(0, 5)}`),
      }))
      .filter((d) => d.windows.length > 0),
  };
}

/** Time off that hasn't ended yet, soonest first. Same rows the API's GET returns. */
export async function loadUpcomingTimeOff(teacher: TeacherRow, now = new Date()) {
  const rows = await db
    .select({ id: teacherTimeOff.id, startsAt: teacherTimeOff.startsAt, endsAt: teacherTimeOff.endsAt, reason: teacherTimeOff.reason })
    .from(teacherTimeOff)
    .where(and(eq(teacherTimeOff.teacherId, teacher.id), eq(teacherTimeOff.orgId, teacher.orgId), gte(teacherTimeOff.endsAt, now)))
    .orderBy(asc(teacherTimeOff.startsAt));
  return rows.map((r) => ({ id: r.id, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), reason: r.reason }));
}

export type TimeOffItem = Awaited<ReturnType<typeof loadUpcomingTimeOff>>[number];

/** "12.5 h" — hours to one decimal, from seconds. */
export function formatHours(seconds: number): string {
  return `${(Math.round((seconds / 3600) * 10) / 10).toFixed(1)} h`;
}
