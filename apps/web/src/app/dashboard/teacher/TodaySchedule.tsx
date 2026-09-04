'use client';

/**
 * Today's Schedule — the teacher's classes for *their* calendar day.
 *
 * WHY CLIENT-SIDE: "today" was computed on the server, which runs in UTC on
 * Cloudflare Workers. For a teacher in India a 4:30 AM IST class is 23:00 UTC
 * the previous day, so it landed on the wrong day (or dropped out of the
 * window entirely) and the time column read 11:00 PM. The page now queries a
 * ±1 day window and this component picks out the rows that fall on the
 * viewer's own local date — correct for every timezone, DST included.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import LocalTime from '@/components/LocalTime';
import SessionRowActions from './SessionRowActions';

export interface ScheduleRow {
  id: string;
  scheduledStart: string;
  status: string;
  title: string | null;
  track: string | null;
  studentNames: string;
}

export default function TodaySchedule({ rows }: { rows: ScheduleRow[] }) {
  // Start with every row in the window so the server HTML and the first
  // client render agree, then narrow to the viewer's local day.
  const [today, setToday] = useState<ScheduleRow[]>(rows);

  useEffect(() => {
    const now = new Date();
    setToday(
      rows.filter((r) => {
        if (!r.scheduledStart) return false;
        const d = new Date(r.scheduledStart);
        if (Number.isNaN(d.getTime())) return false;
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      })
    );
  }, [rows]);

  if (today.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm italic" style={{ color: 'var(--text-tertiary)' }}>
          No classes scheduled for today.
        </p>
      </div>
    );
  }

  return (
    <>
      {today.map((s, i) => (
        <div
          key={s.id}
          className="flex items-center justify-between p-4"
          style={{ borderBottom: i < today.length - 1 ? '1px solid var(--border)' : undefined }}
        >
          <div className="flex items-center gap-4">
            <div className="text-xs font-mono font-bold w-20" style={{ color: 'var(--text-tertiary)' }}>
              <LocalTime iso={s.scheduledStart} />
            </div>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {s.studentNames}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {s.track} — {s.title}
              </div>
            </div>
          </div>
          {s.status === 'SCHEDULED' ? (
            <Link
              href={`/dashboard/session/${s.id}`}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Start Class
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ background: '#dcfce7', color: '#166534' }}
              >
                {s.status.toLowerCase()}
              </span>
              <SessionRowActions sessionId={s.id} showEnd={s.status === 'IN_PROGRESS'} />
            </div>
          )}
        </div>
      ))}
    </>
  );
}
