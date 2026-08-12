'use client';

/**
 * The attendance table.
 *
 * Client-side on purpose, and not only for the filters: every instant here has
 * to be read in the *viewer's* zone, and grouping classes into days can only
 * happen once that zone is known. The server hands over one flat list covering
 * a wide window; this narrows and buckets it.
 *
 * Following the pattern in dashboard/teacher/TodaySchedule.tsx — start from
 * the full set the server sent so the first render matches the server's HTML,
 * then narrow in an effect once `useViewerTimeZone` has resolved.
 */

import { useEffect, useMemo, useState } from 'react';
import LocalTime, { dayKeyInZone, formatInZone, useViewerTimeZone } from '@/components/LocalTime';
import type { AttendanceOccurrence, AttendancePerson } from '@/lib/attendance';

/** Row colours, matching the status pills used on the billing page. */
const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  PRESENT: { bg: '#dcfce7', fg: '#166534', label: 'Present' },
  LATE: { bg: '#fef3c7', fg: '#92400e', label: 'Late' },
  ABSENT: { bg: '#fee2e2', fg: '#991b1b', label: 'Absent' },
};

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "4 min late" / "2 min early" / "on time". Blank when they never arrived. */
function formatLateness(seconds: number | null): string {
  if (seconds === null) return '—';
  const abs = Math.abs(seconds);
  if (abs < 60) return 'on time';
  const minutes = Math.round(abs / 60);
  const amount = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return seconds > 0 ? `${amount} late` : `${amount} early`;
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  // Quote anything that would otherwise break the row. A student's name with a
  // comma in it silently shifted every column in the existing export route.
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function AttendanceReport({
  occurrences,
  isAdmin,
}: {
  occurrences: AttendanceOccurrence[];
  isAdmin: boolean;
}) {
  const timeZone = useViewerTimeZone();
  const [days, setDays] = useState(7);
  const [teacherFilter, setTeacherFilter] = useState<string>('all');

  // Empty until the zone resolves, which is one effect after mount. Rendering
  // the unfiltered set until then keeps the server and client HTML in step.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (timeZone) setReady(true);
  }, [timeZone]);

  const teachers = useMemo(() => {
    const byId = new Map<string, string>();
    for (const occ of occurrences) byId.set(occ.teacherId, occ.teacherName);
    return [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [occurrences]);

  const visible = useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return occurrences.filter((occ) => {
      if (teacherFilter !== 'all' && occ.teacherId !== teacherFilter) return false;
      if (!occ.scheduledStart) return false;
      return new Date(occ.scheduledStart).getTime() >= cutoff;
    });
  }, [occurrences, days, teacherFilter]);

  // Grouped by the viewer's calendar day — the same instant is Tuesday evening
  // in Illinois and Wednesday morning in India, and each viewer should see
  // their own.
  const grouped = useMemo(() => {
    const byDay = new Map<string, AttendanceOccurrence[]>();
    for (const occ of visible) {
      if (!occ.scheduledStart) continue;
      const key = dayKeyInZone(occ.scheduledStart, timeZone || 'UTC');
      const list = byDay.get(key);
      if (list) list.push(occ);
      else byDay.set(key, [occ]);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible, timeZone]);

  const downloadCsv = () => {
    // Built here rather than server-side so the times in it are the viewer's,
    // not the Worker's UTC.
    const header = [
      'Day', 'Class', 'Teacher', 'Scheduled start', 'Person', 'Role',
      'Joined', 'Late by (s)', 'Left', 'Duration (s)', 'Reconnects', 'Status',
    ];
    const rows: string[] = [header.map(csvCell).join(',')];

    for (const [day, dayOccurrences] of grouped) {
      for (const occ of dayOccurrences) {
        const people = [occ.teacher, ...occ.students, ...occ.observers].filter(Boolean) as AttendancePerson[];
        for (const person of people) {
          rows.push(
            [
              day,
              occ.title ?? '',
              occ.teacherName,
              occ.scheduledStart ? formatInZone(occ.scheduledStart, 'date-time', true, timeZone || undefined) : '',
              person.name,
              person.role,
              person.firstJoinedAt
                ? formatInZone(person.firstJoinedAt, 'time-seconds', true, timeZone || undefined)
                : '',
              person.lateBySeconds ?? '',
              person.lastLeftAt
                ? formatInZone(person.lastLeftAt, 'time-seconds', true, timeZone || undefined)
                : '',
              person.durationSeconds ?? '',
              person.connections,
              person.status,
            ].map(csvCell).join(',')
          );
        }
      }
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-${grouped[0]?.[0] ?? 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Attendance
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            When everybody joined each class, in your own time zone
            {ready && timeZone ? ` (${timeZone})` : ''}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value={1}>Last 24 hours</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={45}>Last 45 days</option>
          </select>

          {isAdmin && teachers.length > 1 && (
            <select
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="all">All teachers</option>
              {teachers.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}

          <button
            onClick={downloadCsv}
            disabled={grouped.length === 0}
            className="px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            Download CSV
          </button>
        </div>
      </div>

      {grouped.length === 0 && (
        <section className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No classes in this period yet.
          </p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            Attendance is recorded from the moment somebody actually joins a call — classes
            held before this was switched on won&apos;t appear.
          </p>
        </section>
      )}

      <div className="flex flex-col gap-6">
        {grouped.map(([day, dayOccurrences]) => (
          <section key={day} className="card">
            <div className="p-5" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2
                className="text-sm font-semibold uppercase tracking-widest"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {dayOccurrences[0].scheduledStart ? (
                  <LocalTime iso={dayOccurrences[0].scheduledStart} mode="full-date" />
                ) : (
                  day
                )}
              </h2>
            </div>

            {dayOccurrences.map((occ) => (
              <ClassTable key={occ.sessionId} occurrence={occ} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function ClassTable({ occurrence }: { occurrence: AttendanceOccurrence }) {
  const people: AttendancePerson[] = [
    ...(occurrence.teacher ? [occurrence.teacher] : []),
    ...occurrence.students,
    ...occurrence.observers,
  ];

  const attended = occurrence.students.filter((s) => s.status !== 'ABSENT').length;

  return (
    <div>
      <div
        className="px-5 py-3 flex flex-wrap items-baseline justify-between gap-2"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {occurrence.title || 'Class'}
          <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>
            {' · '}
            {occurrence.teacherName}
          </span>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {occurrence.scheduledStart && (
            <>
              Scheduled <LocalTime iso={occurrence.scheduledStart} mode="time" withZone />
              {occurrence.scheduledEnd && (
                <>
                  {' – '}
                  <LocalTime iso={occurrence.scheduledEnd} mode="time" />
                </>
              )}
              {' · '}
            </>
          )}
          {attended}/{occurrence.students.length} students
          {/* The teacher not showing up is the one absence worth calling out
              on the summary line rather than leaving in the table. */}
          {!occurrence.teacher && (
            <span style={{ color: '#991b1b' }}>{' · teacher never joined'}</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Person', 'Joined', 'Late by', 'Left', 'Duration', 'Status'].map((label) => (
                <th
                  key={label}
                  className="text-left text-[11px] font-semibold uppercase tracking-widest px-5 py-3 whitespace-nowrap"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.map((person, i) => {
              const status = STATUS_STYLE[person.status] ?? STATUS_STYLE.PRESENT;
              const isTeacher = person.role === 'TEACHER';
              return (
                <tr
                  key={`${person.role}-${person.userId ?? person.name}-${i}`}
                  style={{
                    borderBottom: i < people.length - 1 ? '1px solid var(--border)' : undefined,
                    // The teacher's row is the one people scan for first.
                    background: isTeacher ? 'var(--bg-secondary)' : undefined,
                  }}
                >
                  <td className="px-5 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                    {person.name}
                    {person.role !== 'STUDENT' && (
                      <span
                        className="ml-2 text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {person.role}
                      </span>
                    )}
                    {person.connections > 1 && (
                      <span
                        className="ml-2 text-[10px]"
                        style={{ color: 'var(--text-tertiary)' }}
                        title="Dropped and rejoined"
                      >
                        ×{person.connections}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {person.firstJoinedAt ? (
                      <LocalTime iso={person.firstJoinedAt} mode="time-seconds" withZone />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {formatLateness(person.lateBySeconds)}
                  </td>
                  <td className="px-5 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {person.lastLeftAt ? (
                      <LocalTime iso={person.lastLeftAt} mode="time-seconds" />
                    ) : person.firstJoinedAt ? (
                      // Open row: either they are genuinely still in the call,
                      // or nothing ever recorded their leaving. Say so rather
                      // than inventing a departure time.
                      <span style={{ color: 'var(--text-tertiary)' }}>still in class</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
                    {formatDuration(person.durationSeconds)}
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span
                      className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
                      style={{ background: status.bg, color: status.fg }}
                    >
                      {person.role === 'OBSERVER' ? 'Observed' : status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
