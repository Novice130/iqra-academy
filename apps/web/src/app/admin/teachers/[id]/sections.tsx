/**
 * @fileoverview Read-only panels for /admin/teachers/[id].
 *
 * Server components. Every instant is rendered through <LocalTime>, which is
 * a client component, so times land in the viewer's zone and not the
 * server's UTC.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { RosterStudent, TeacherClass } from "@/lib/admin-teachers";
import { Badge, EmptyState, StatusBadge, humanize, table } from "../../_components/ui";

const DAY_SHORT: Record<string, string> = {
  SUNDAY: "Sun", MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat",
};

export function minutes(seconds: number | null): string {
  return seconds === null ? "—" : `${Math.round(seconds / 60)} min`;
}

function studentsLine(c: TeacherClass): string {
  if (c.students.length === 0) return "No students booked";
  return c.students.map((s) => s.name).join(", ");
}

/** Classes in the current week, earliest first, each linking to its session page. */
export function WeekClasses({ classes }: { classes: TeacherClass[] }) {
  if (classes.length === 0) {
    return <EmptyState title="No classes this week" body="Nothing is scheduled with this teacher between Sunday and Saturday." />;
  }
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>When</th>
            <th scope="col" className={table.th}>Class</th>
            <th scope="col" className={table.th}>Students</th>
            <th scope="col" className={table.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.sessionId} className={table.tr}>
              <td className={`${table.td} whitespace-nowrap`}>
                {c.scheduledStart ? <LocalTime iso={c.scheduledStart} mode="weekday-time" /> : "—"}
              </td>
              <td className={table.td}>
                <Link href={`/admin/sessions/${c.sessionId}`} className="font-semibold hover:text-[var(--accent)] hover:underline">
                  {c.title || "Class"}
                </Link>
              </td>
              <td className={`${table.td} text-[var(--text-secondary)]`}>{studentsLine(c)}</td>
              <td className={table.td}>
                <StatusBadge status={c.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The teacher's side of past classes: when they arrived, how late, how long. */
export function RecentAttendance({ classes }: { classes: TeacherClass[] }) {
  if (classes.length === 0) {
    return <EmptyState title="No past classes yet" body="Classes from the last two months will show here once they have happened." />;
  }
  return (
    <div className={table.wrap}>
      <table className={table.table}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>Scheduled</th>
            <th scope="col" className={table.th}>Class</th>
            <th scope="col" className={table.th}>Teacher joined</th>
            <th scope="col" className={`${table.th} text-right`}>Late by</th>
            <th scope="col" className={`${table.th} text-right`}>In room</th>
            <th scope="col" className={`${table.th} text-right`}>Students</th>
            <th scope="col" className={table.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => {
            const attended = c.students.filter((s) => s.status !== "ABSENT").length;
            return (
              <tr key={c.sessionId} className={table.tr}>
                <td className={`${table.td} whitespace-nowrap`}>
                  {c.scheduledStart ? <LocalTime iso={c.scheduledStart} mode="date-time" /> : "—"}
                </td>
                <td className={table.td}>
                  <Link href={`/admin/sessions/${c.sessionId}`} className="hover:text-[var(--accent)] hover:underline">
                    {c.title || "Class"}
                  </Link>
                </td>
                <td className={`${table.td} whitespace-nowrap`}>
                  {c.teacherJoinedAt ? (
                    <>
                      <LocalTime iso={c.teacherJoinedAt} mode="time-seconds" />
                      {c.teacherStatus === "LATE" && (
                        <span className="ml-1.5">
                          <Badge tone="warning">Late</Badge>
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge tone="danger">Did not join</Badge>
                  )}
                </td>
                <td className={`${table.td} text-right tabular-nums`}>
                  {c.teacherLateBySeconds !== null && c.teacherLateBySeconds > 0 ? minutes(c.teacherLateBySeconds) : "—"}
                </td>
                <td className={`${table.td} text-right tabular-nums`}>{minutes(c.teacherSeconds)}</td>
                <td className={`${table.td} text-right tabular-nums`}>
                  {attended}/{c.students.length}
                </td>
                <td className={table.td}>
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Roster({ students }: { students: RosterStudent[] }) {
  if (students.length === 0) {
    return <EmptyState title="No students" body="Nobody has a weekly slot or an upcoming class with this teacher." />;
  }
  return (
    <ul className="divide-y divide-[var(--border)]">
      {students.map((s) => (
        <li key={s.profileId} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <Link href={`/admin/students/${s.profileId}`} className="text-sm font-semibold hover:text-[var(--accent)] hover:underline">
              {s.name}
            </Link>
            <div className="text-xs text-[var(--text-secondary)]">
              {humanize(s.track)}
              {s.weeklySlot &&
                ` · Weekly ${DAY_SHORT[s.weeklySlot.dayOfWeek]} ${s.weeklySlot.startTime} (${s.weeklySlot.timezone})`}
            </div>
          </div>
          <div className="text-xs text-[var(--text-secondary)] sm:text-right">
            {s.nextClassAt ? (
              <>
                Next: <LocalTime iso={s.nextClassAt} mode="date-time" />
                <div className="text-[var(--text-tertiary)]">{s.upcomingClasses} upcoming</div>
              </>
            ) : (
              "No upcoming class booked"
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AvailabilitySummary({
  availability,
}: {
  availability: { zones: string[]; days: { day: string; windows: string[] }[] };
}) {
  if (availability.days.length === 0) {
    return <EmptyState title="No weekly hours set" body="Students can't book this teacher until weekly hours are added." />;
  }
  return (
    <div className="space-y-3">
      <dl className="space-y-2">
        {availability.days.map((d) => (
          <div key={d.day} className="flex gap-3 text-sm">
            <dt className="w-10 shrink-0 font-semibold text-[var(--text-secondary)]">{DAY_SHORT[d.day]}</dt>
            <dd className="text-[var(--text-primary)] tabular-nums">{d.windows.join(", ")}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-[var(--text-tertiary)]">
        Times are in {availability.zones.join(", ") || "the teacher's zone"}, as the teacher saved them.
      </p>
    </div>
  );
}
