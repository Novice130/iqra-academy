/**
 * @fileoverview /admin/teacher-schedules — one week, teachers down the side,
 * days across: availability, booked classes and time off.
 *
 * THE WEEK IS THE VIEWER'S WEEK. It used to be computed with date-fns in the
 * server's zone (UTC in production) and then `addDays(start, 7)` was pushed
 * to 23:59, which made an eight-day "week" starting at the wrong midnight for
 * everyone not in UTC. Now: Sunday 00:00 to the next Sunday 00:00 in the
 * viewer's zone, exactly seven days, and every day boundary and half-hour
 * slot is computed here as an instant so the client only formats.
 *
 * Availability is stored as wall-clock ranges in each *teacher's* zone; it is
 * expanded to instants with lib/slots.ts `expandAvailability`, the same code
 * that offers slots to families, so this grid and the booking page agree.
 */

import Link from "next/link";
import { and, asc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import { db, withHttpDb } from "@/lib/db";
import { sessions, teacherAvailability, teacherTimeOff, users } from "@/db/schema";
import { orgFilter, requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import { expandAvailability, wallClockRoundTrips, zonedDayParts, zonedWallClockToInstant } from "@/lib/slots";
import { addDaysToDateKey } from "@/lib/admin-scheduling";
import { EmptyState, PageHeader, Panel, btn } from "@/app/admin/_components/ui";
import TeacherSpreadsheet, { type ScheduleDay, type TeacherScheduleData } from "./TeacherSpreadsheet";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ week?: string }>;
}

const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const FIRST_HOUR = 6;
const LAST_HOUR = 22;

function parts(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y, m, d];
}

/** Seven days of the requested week in `zone`, with their half-hour slots. */
function buildWeek(zone: string, weekOffset: number): ScheduleDay[] {
  const today = zonedDayParts(new Date(), zone);
  const todayKey = `${today.y}-${String(today.m).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;
  const sunday = addDaysToDateKey(todayKey, -WEEKDAYS.indexOf(today.weekday) + weekOffset * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysToDateKey(sunday, i);
    const next = addDaysToDateKey(sunday, i + 1);
    const slots: ScheduleDay["slots"] = [];
    for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
      for (const m of [0, 30]) {
        const at = zonedWallClockToInstant(...parts(key), h, m, zone);
        // A half hour lost to the spring-forward change does not exist.
        if (!wallClockRoundTrips(at, zone, h, m)) continue;
        slots.push({ label: `${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`, iso: at.toISOString() });
      }
    }
    return {
      key,
      startIso: zonedWallClockToInstant(...parts(key), 0, 0, zone).toISOString(),
      endIso: zonedWallClockToInstant(...parts(next), 0, 0, zone).toISOString(),
      slots,
    };
  });
}

export default async function AdminTeacherSchedulesPage({ searchParams }: Props) {
  return withHttpDb(async () => {
    const admin = await requireAdminPage("/admin/teacher-schedules");
    const p = await searchParams;
    const weekOffset = Math.max(-52, Math.min(52, parseInt(p.week || "0", 10) || 0));
    // Without an account or IP zone there is no viewer zone to be had on the
    // server; UTC is then said out loud in the grid rather than guessed.
    const zone = (await resolveViewerZone(admin.timezone)).timeZone ?? "UTC";

    const days = buildWeek(zone, weekOffset);
    const weekStart = new Date(days[0].startIso);
    const weekEnd = new Date(days[6].endIso);

    const teacherRows = await db.query.users.findMany({
      where: and(
        inArray(users.role, ["TEACHER", "ORG_ADMIN", "SUPER_ADMIN"]),
        isNull(users.deletedAt),
        orgFilter(admin, users.orgId)
      ),
      columns: { id: true, name: true, email: true, timezone: true },
      orderBy: [asc(users.name)],
    });
    const teacherIds = teacherRows.map((t) => t.id);

    const [availabilityRows, timeOffRows, sessionRows] =
      teacherIds.length === 0
        ? [[], [], []]
        : await Promise.all([
            db.query.teacherAvailability.findMany({
              where: and(
                inArray(teacherAvailability.teacherId, teacherIds),
                eq(teacherAvailability.isActive, true),
                orgFilter(admin, teacherAvailability.orgId)
              ),
            }),
            db.query.teacherTimeOff.findMany({
              where: and(
                inArray(teacherTimeOff.teacherId, teacherIds),
                lt(teacherTimeOff.startsAt, weekEnd),
                gt(teacherTimeOff.endsAt, weekStart),
                orgFilter(admin, teacherTimeOff.orgId)
              ),
            }),
            db.query.sessions.findMany({
              where: and(
                inArray(sessions.teacherId, teacherIds),
                gte(sessions.scheduledStart, weekStart),
                lt(sessions.scheduledStart, weekEnd),
                isNull(sessions.mergedIntoId),
                orgFilter(admin, sessions.orgId)
              ),
              columns: { id: true, teacherId: true, title: true, track: true, status: true, scheduledStart: true, scheduledEnd: true },
              with: { bookings: { columns: { status: true }, with: { studentProfile: { columns: { name: true } } } } },
              orderBy: [asc(sessions.scheduledStart)],
            }),
          ]);

    const names = new Map(teacherRows.map((t) => [t.id, t.name || t.email]));
    const offered = expandAvailability(availabilityRows, names, weekStart, weekEnd);

    const teachers: TeacherScheduleData[] = teacherRows.map((t) => ({
      id: t.id,
      name: t.name || t.email,
      email: t.email,
      timezone: t.timezone,
      available: offered
        .filter((s) => s.teacherId === t.id)
        .map((s) => ({ startIso: s.startsAt.toISOString(), endIso: s.endsAt.toISOString() })),
      timeOff: timeOffRows
        .filter((o) => o.teacherId === t.id)
        .map((o) => ({ startIso: new Date(o.startsAt).toISOString(), endIso: new Date(o.endsAt).toISOString(), reason: o.reason })),
      sessions: sessionRows
        .filter((s) => s.teacherId === t.id)
        .map((s) => ({
          id: s.id,
          title: s.title || "Lesson",
          track: s.track || "QAIDAH",
          status: s.status,
          studentNames:
            s.bookings
              .filter((b) => b.status !== "CANCELLED" || s.status === "CANCELLED")
              .map((b) => b.studentProfile?.name)
              .filter(Boolean)
              .join(", ") || "No student",
          startIso: new Date(s.scheduledStart).toISOString(),
          endIso: new Date(s.scheduledEnd).toISOString(),
        })),
    }));

    return (
      <div className="space-y-6">
        <PageHeader
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Teacher schedules" }]}
          title="Teacher schedules"
          description="One week of availability, booked classes and time off. Open slots link to a prefilled booking form; booked ones to the class."
          actions={
            <>
              <Link href="/admin/scheduled-classes" className={btn.secondary}>
                Scheduled classes
              </Link>
              <Link href="/admin/assign-student" className={btn.primary}>
                Assign student
              </Link>
            </>
          }
        />
        {teachers.length === 0 ? (
          <Panel>
            <EmptyState title="No teachers yet" body="Give someone the teacher role and their week appears here." />
          </Panel>
        ) : (
          <TeacherSpreadsheet teachers={teachers} days={days} zone={zone} weekOffset={weekOffset} />
        )}
      </div>
    );
  });
}
