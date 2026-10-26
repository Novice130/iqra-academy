/**
 * @fileoverview Who was in one class, from lib/attendance.ts.
 *
 * Uses the attendance report rather than reading session_attendance by id,
 * because a class is often several session rows (a group row plus one per
 * student) and the report already knows how to fold those into one
 * occurrence — the same rule the join API uses to pick a room.
 */

import LocalTime from "@/components/LocalTime";
import { EmptyState, Panel, StatusBadge, table } from "@/app/admin/_components/ui";
import type { AttendanceOccurrence, AttendancePerson } from "@/lib/attendance";

function minutes(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.round(seconds / 60)} min`;
}

function lateness(seconds: number | null): string {
  if (seconds === null) return "—";
  const m = Math.round(seconds / 60);
  if (m <= 0) return m === 0 ? "On time" : `${-m} min early`;
  return `${m} min late`;
}

function Row({ person }: { person: AttendancePerson }) {
  return (
    <tr className={table.tr}>
      <td className={table.td}>
        <div className="font-medium">{person.name}</div>
        <div className="text-xs text-[var(--text-tertiary)]">{person.role === "TEACHER" ? "Teacher" : person.role === "OBSERVER" ? "Observer" : "Student"}</div>
      </td>
      <td className={table.td}>
        <StatusBadge status={person.status} />
      </td>
      <td className={`${table.td} whitespace-nowrap`}>{person.firstJoinedAt ? <LocalTime iso={person.firstJoinedAt} mode="time-seconds" /> : "—"}</td>
      <td className={`${table.td} whitespace-nowrap`}>
        {person.lastLeftAt ? <LocalTime iso={person.lastLeftAt} mode="time-seconds" /> : person.firstJoinedAt ? "Still in, or not recorded" : "—"}
      </td>
      <td className={`${table.td} whitespace-nowrap tabular-nums`}>
        {minutes(person.durationSeconds)}
        {person.connections > 1 && <span className="ml-1 text-xs text-[var(--text-tertiary)]">({person.connections} connections)</span>}
      </td>
      <td className={`${table.td} whitespace-nowrap`}>{lateness(person.lateBySeconds)}</td>
    </tr>
  );
}

export default function AttendancePanel({ occurrence, hasStarted }: { occurrence: AttendanceOccurrence | null; hasStarted: boolean }) {
  const people: AttendancePerson[] = occurrence
    ? [...(occurrence.teacher ? [occurrence.teacher] : []), ...occurrence.students, ...occurrence.observers]
    : [];
  const teacherMissing = occurrence && !occurrence.teacher && hasStarted;

  return (
    <Panel
      title="Attendance"
      description="Joined and left times come from the video room. Late means more than 5 minutes after the scheduled start."
      flush
    >
      {people.length === 0 ? (
        <EmptyState
          title={hasStarted ? "Nobody joined this class" : "Class has not started"}
          body={hasStarted ? "No one connected to the room, and no bookings are attached." : "Attendance appears here once people join the room."}
        />
      ) : (
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th scope="col" className={table.th}>Person</th>
                <th scope="col" className={table.th}>Status</th>
                <th scope="col" className={table.th}>Joined</th>
                <th scope="col" className={table.th}>Left</th>
                <th scope="col" className={table.th}>Time in room</th>
                <th scope="col" className={table.th}>Arrival</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p, i) => (
                <Row key={`${p.userId ?? p.name}-${i}`} person={p} />
              ))}
            </tbody>
          </table>
          {teacherMissing && (
            <p className="px-4 py-3 text-xs text-[var(--color-warning)] border-t border-[var(--border)]">The teacher has no recorded connection to this class.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
