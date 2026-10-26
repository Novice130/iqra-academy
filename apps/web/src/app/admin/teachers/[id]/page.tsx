/**
 * @fileoverview /admin/teachers/[id] — one teacher: hours, classes, students,
 * weekly hours and time off.
 *
 * `?month=YYYY-MM` picks the month for the hours panel and its CSV, which is
 * what admins pay teachers from. Months and weeks run in the admin's zone.
 * 404s for anyone who is not a teaching role in the admin's scope, so an id
 * from another org reads the same as one that doesn't exist.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { withHttpDb } from "@/lib/db";
import { requireAdminPage } from "@/lib/admin-page";
import { resolveViewerZone } from "@/lib/viewer-zone";
import {
  formatHours,
  loadTeacherAvailability,
  loadTeacherClasses,
  loadTeacherForAdmin,
  loadTeacherRoster,
  loadUpcomingTimeOff,
  monthKey,
  parseMonthKey,
  shiftMonthKey,
} from "@/lib/admin-teachers";
import { ROLE_LABELS } from "@/lib/roles";
import LocalTime from "@/components/LocalTime";
import { DefinitionList, PageHeader, Panel, StatCard, StatGrid, btn, input, label } from "../../_components/ui";
import { AvailabilitySummary, RecentAttendance, Roster, WeekClasses } from "./sections";
import TimeOffManager from "./TimeOffManager";
import MonthCsvButton from "./MonthCsvButton";

export const dynamic = "force-dynamic";

function rate(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function monthLabel(key: string): string {
  const p = parseMonthKey(key)!;
  // A fixed mid-month UTC instant: safe to name the month in any zone.
  return new Date(Date.UTC(p.y, p.m - 1, 15)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default async function AdminTeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  return withHttpDb(async () => {
    const { id } = await params;
    const { month } = await searchParams;
    const admin = await requireAdminPage(`/admin/teachers/${id}`);
    const zone = (await resolveViewerZone(admin.timezone)).timeZone ?? "UTC";

    const teacher = await loadTeacherForAdmin(admin, id);
    if (!teacher) notFound();

    const current = monthKey(new Date(), zone);
    const selected = parseMonthKey(month) ? month! : current;

    const [classes, roster, availability, timeOff] = await Promise.all([
      loadTeacherClasses(teacher, zone, selected),
      loadTeacherRoster(teacher),
      loadTeacherAvailability(teacher),
      loadUpcomingTimeOff(teacher),
    ]);
    const { stats, thisWeek, recent } = classes;
    const name = teacher.name || teacher.email;
    const base = `/admin/teachers/${teacher.id}`;

    return (
      <div className="space-y-6">
        <PageHeader
          title={name}
          description={`${ROLE_LABELS[teacher.role]} · ${teacher.email}`}
          crumbs={[{ label: "Admin", href: "/admin" }, { label: "Teachers", href: "/admin/teachers" }, { label: name }]}
          actions={
            <>
              <Link href={`/dashboard/teacher/availability?teacherId=${teacher.id}`} className={btn.secondary}>
                Edit availability
              </Link>
              <Link href={`/admin/assign-student?teacherId=${teacher.id}`} className={btn.primary}>
                Book a class
              </Link>
            </>
          }
        />

        <StatGrid>
          <StatCard label="Hours this month" value={formatHours(stats.secondsThisMonth)} />
          <StatCard label="Hours last month" value={formatHours(stats.secondsLastMonth)} />
          <StatCard label="Classes completed" value={stats.completed30} hint="Last 30 days" />
          <StatCard
            label="Student attendance"
            value={rate(stats.studentAttendance.attended, stats.studentAttendance.expected)}
            hint={`${stats.studentAttendance.attended} of ${stats.studentAttendance.expected} booked, 30 days`}
          />
          <StatCard
            label="Teacher on time"
            value={rate(stats.punctuality.onTime, stats.punctuality.joined)}
            hint={`${stats.punctuality.onTime} of ${stats.punctuality.joined} joined within 5 min`}
          />
          <StatCard
            label="No-shows"
            value={stats.noShows30}
            hint="Last 30 days"
            tone={stats.noShows30 > 0 ? "danger" : "neutral"}
          />
        </StatGrid>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Profile">
            <DefinitionList
              items={[
                { term: "Name", value: name },
                { term: "Email", value: teacher.email },
                { term: "Phone", value: teacher.phone || "Not set" },
                { term: "Time zone", value: teacher.timezone || "Not set — follows their device" },
                { term: "Role", value: ROLE_LABELS[teacher.role] },
                { term: "Joined", value: <LocalTime iso={teacher.createdAt.toISOString()} mode="full-date" /> },
              ]}
            />
          </Panel>
          <Panel
            title="Weekly availability"
            actions={
              <Link href={`/dashboard/teacher/availability?teacherId=${teacher.id}`} className={btn.ghost}>
                Edit
              </Link>
            }
          >
            <AvailabilitySummary availability={availability} />
          </Panel>
        </div>

        <Panel title="This week's classes" description={`Sunday to Saturday, ${zone}.`} flush>
          <WeekClasses classes={thisWeek} />
        </Panel>

        <Panel
          title={`Hours for ${monthLabel(selected)}`}
          description={`${classes.month.classes.length} classes, ${formatHours(classes.month.seconds)} in the room. Months run in ${zone}.`}
          actions={<MonthCsvButton classes={classes.month.classes} teacherName={name} month={selected} />}
        >
          <form method="get" action={base} className="flex flex-wrap items-end gap-2">
            <Link href={`${base}?month=${shiftMonthKey(selected, -1)}`} className={btn.ghost}>
              Previous month
            </Link>
            <div>
              <label htmlFor="month" className={label}>Month</label>
              <input id="month" name="month" type="month" defaultValue={selected} max={current} className={`${input} w-44`} />
            </div>
            <button type="submit" className={btn.secondary}>Show</button>
            {selected < current && (
              <Link href={`${base}?month=${shiftMonthKey(selected, 1)}`} className={btn.ghost}>
                Next month
              </Link>
            )}
          </form>
          <p className="mt-3 text-xs text-[var(--text-tertiary)]">
            Hours count only time the teacher was connected to the class, summed over reconnects. A class still in
            progress counts once it ends.
          </p>
        </Panel>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="Students" description={`${roster.length} with a weekly slot or an upcoming class.`} flush>
            <Roster students={roster} />
          </Panel>
          <Panel title="Time off" description="Upcoming and current. Slots in these ranges are not offered to students.">
            <TimeOffManager teacherId={teacher.id} teacherZone={teacher.timezone} initial={timeOff} />
          </Panel>
        </div>

        <Panel title="Recent attendance" description="The last 20 classes, newest first." flush>
          <RecentAttendance classes={recent} />
        </Panel>
      </div>
    );
  });
}
