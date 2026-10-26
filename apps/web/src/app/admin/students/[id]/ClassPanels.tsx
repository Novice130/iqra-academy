/**
 * @fileoverview Teaching panels on the student 360: weekly slots, upcoming
 * and recent classes. Server components; times render through LocalTime.
 */

import Link from "next/link";
import LocalTime from "@/components/LocalTime";
import type { Student360, StudentClassRow } from "@/lib/admin-students";
import { Badge, EmptyState, Panel, StatusBadge, btn, humanize, table } from "../../_components/ui";

const ATTENDANCE_TONE = { PRESENT: "success", LATE: "warning", ABSENT: "danger" } as const;

function AttendanceCell({ row }: { row: StudentClassRow }) {
  if (!row.attendance) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  return (
    <Badge tone={ATTENDANCE_TONE[row.attendance]}>
      {humanize(row.attendance)}
      {row.lateMinutes ? ` (${row.lateMinutes} min)` : ""}
    </Badge>
  );
}

function ClassTable({ rows, showAttendance }: { rows: StudentClassRow[]; showAttendance: boolean }) {
  return (
    <div className={table.wrap}>
      <table className={`${table.table} min-w-[640px]`}>
        <thead>
          <tr>
            <th scope="col" className={table.th}>When</th>
            <th scope="col" className={table.th}>Teacher</th>
            <th scope="col" className={table.th}>Class status</th>
            {showAttendance && <th scope="col" className={table.th}>Attendance</th>}
            <th scope="col" className={table.th}><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.sessionId} className={table.tr}>
              <td className={`${table.td} whitespace-nowrap`}>
                <LocalTime iso={c.startsAt} mode="date-time" withZone />
                {c.isTrial && <span className="ml-2"><Badge tone="info">Trial</Badge></span>}
              </td>
              <td className={table.td}>{c.teacherName}</td>
              <td className={table.td}>
                <StatusBadge status={c.bookingStatus === "CANCELLED" ? "CANCELLED" : c.sessionStatus} />
              </td>
              {showAttendance && (
                <td className={table.td}><AttendanceCell row={c} /></td>
              )}
              <td className={`${table.td} text-right`}>
                <Link href={`/admin/sessions/${c.sessionId}`} className={btn.ghost}>
                  Open<span className="sr-only"> class</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SlotsPanel({ data }: { data: Student360 }) {
  const bookHref = `/admin/assign-student?studentId=${encodeURIComponent(data.profile.id)}`;
  return (
    <Panel title="Teacher and weekly slots" description="The default weekly time, kept in the zone it was set in.">
      {data.slots.length === 0 ? (
        <EmptyState
          title="No weekly slot"
          body="This student has no default weekly time. Classes are booked one at a time."
          action={<Link href={bookHref} className={btn.secondary}>Book a class</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {data.slots.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  <Link href={`/admin/teachers/${s.teacherId}`} className="hover:text-[var(--accent)] hover:underline">
                    {s.teacherName}
                  </Link>
                </div>
                <div className="text-xs text-[var(--text-secondary)]">
                  {humanize(s.track)} · {humanize(s.dayOfWeek)} {s.startTime.slice(0, 5)} ({s.timezone})
                </div>
              </div>
              <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Paused"}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function UpcomingPanel({ data }: { data: Student360 }) {
  const bookHref = `/admin/assign-student?studentId=${encodeURIComponent(data.profile.id)}`;
  return (
    <Panel title="Upcoming classes" description="The next ten booked classes." flush>
      {data.upcoming.length === 0 ? (
        <EmptyState
          title="Nothing booked"
          body={`${data.profile.name} has no upcoming class.`}
          action={<Link href={bookHref} className={btn.primary}>Book a class</Link>}
        />
      ) : (
        <ClassTable rows={data.upcoming} showAttendance={false} />
      )}
    </Panel>
  );
}

export function RecentPanel({ data }: { data: Student360 }) {
  return (
    <Panel title="Recent classes" description="The last fifteen, with attendance from the room's join records." flush>
      {data.recent.length === 0 ? (
        <EmptyState title="No classes yet" body="Past classes will appear here once this student has had one." />
      ) : (
        <ClassTable rows={data.recent} showAttendance />
      )}
    </Panel>
  );
}
