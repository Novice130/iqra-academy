'use client';

/**
 * Week Grid — the calendar itself, rendered in the viewer's timezone.
 *
 * The day columns and hour rows are computed in the browser, so a class the
 * teacher scheduled for 4:30 AM IST lands on the right day and row for a
 * student in Washington (7:00 PM the evening before) or Illinois — DST shifts
 * included, since the browser resolves them from the IANA database.
 *
 * The hour range is derived from the bookings themselves rather than a fixed
 * 7 AM–8 PM window: early-morning and late-night classes were previously
 * outside the grid and simply never drew.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useViewerTimeZone } from '@/components/LocalTime';
import { getMeetingLifecycleState } from '@/lib/class-action';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface WeekBooking {
  id: string;
  sessionId: string;
  studentName: string | null;
  studentId: string | null;
  track: string | null;
  title: string | null;
  start: string;
}

function startOfLocalWeek(offsetWeeks: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + offsetWeeks * 7);
  return d;
}

function getStudentColor(id: string | null) {
  if (!id) return 'var(--accent)';
  const colors = ['#5C7C6F', '#C9A962', '#7C5C64', '#5C647C', '#7C745C'];
  const index = Math.abs(id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colors.length;
  return colors[index];
}

function hourLabel(hour: number) {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

export default function WeekGrid({
  bookings,
  weekOffset,
}: {
  bookings: WeekBooking[];
  weekOffset: number;
}) {
  const tz = useViewerTimeZone();
  const [viewMode, setViewMode] = useState<'week' | 'list'>('week');
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const weekStart = startOfLocalWeek(weekOffset);
  const weekDates = DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
  const weekEnd = new Date(weekDates[6]);
  weekEnd.setHours(23, 59, 59, 999);

  // Only render the grid after mount: the server has no idea what the
  // viewer's local week or hours are, and drawing a UTC version first would
  // visibly jump.
  const inWeek = mounted
    ? bookings.filter((b) => {
        const d = new Date(b.start);
        return d >= weekStart && d <= weekEnd;
      })
    : [];

  const bookedHours = inWeek.map((b) => new Date(b.start).getHours());
  const minHour = bookedHours.length ? Math.min(7, ...bookedHours) : 7;
  const maxHour = bookedHours.length ? Math.max(20, ...bookedHours) : 20;
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);

  const today = new Date();
  const isToday = (date: Date) => mounted && date.toDateString() === today.toDateString();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-[var(--text-tertiary)]">
          {inWeek.length} {inWeek.length === 1 ? 'class' : 'classes'} this week
        </div>
        <div className="flex items-center rounded-xl bg-[var(--bg-secondary)] p-1 border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
              viewMode === 'week'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Week Grid
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
              viewMode === 'list'
                ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-xs'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
            }`}
          >
            List View
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-3">
          {inWeek.length === 0 ? (
            <div className="card p-8 text-center text-sm text-[var(--text-tertiary)]">
              No classes scheduled for this week.
            </div>
          ) : (
            inWeek.map((b) => {
              const lifecycle = getMeetingLifecycleState({ status: 'SCHEDULED', scheduledStart: b.start });
              const isPast = lifecycle === 'COMPLETED' || lifecycle === 'EXPIRED';
              const isLive = lifecycle === 'LIVE';
              const isReady = lifecycle === 'READY';

              const dateStr = new Date(b.start).toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              });
              const timeStr = new Date(b.start).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              });

              return (
                <div
                  key={b.id}
                  className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ background: getStudentColor(b.studentId) }}
                    >
                      {(b.studentName || 'C')[0]}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {b.studentName || 'Student'} • {b.title || 'Class Session'}
                      </div>
                      <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        {dateStr} at {timeStr}
                        {b.track ? ` · ${b.track.toLowerCase()}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    {/* Status chip */}
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5"
                      style={{
                        background: isLive
                          ? '#fee2e2'
                          : isReady
                          ? '#dbeafe'
                          : isPast
                          ? '#f1f5f9'
                          : '#e0e7ff',
                        color: isLive
                          ? '#dc2626'
                          : isReady
                          ? '#1d4ed8'
                          : isPast
                          ? '#64748b'
                          : '#4338ca',
                      }}
                    >
                      {isLive && (
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                      )}
                      {lifecycle}
                    </span>

                    {/* Action */}
                    {isPast ? (
                      <span className="text-xs px-3 py-1.5 rounded-xl text-[var(--text-tertiary)] bg-[var(--bg-secondary)]">
                        Ended
                      </span>
                    ) : (
                      <Link
                        href={`/dashboard/session/${b.sessionId}`}
                        className={`text-xs font-semibold px-4 py-1.5 rounded-xl transition ${
                          isLive || isReady
                            ? 'bg-[var(--accent)] text-white shadow-xs hover:opacity-90'
                            : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--border)]'
                        }`}
                      >
                        {isLive ? 'Join Live' : isReady ? 'Join Class' : 'View Class'}
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
        <div className="min-w-[640px]">
          {/* Header row */}
          <div className="grid grid-cols-8" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="p-3" style={{ borderRight: '1px solid var(--border)' }} />
            {weekDates.map((date, i) => (
              <div
                key={i}
                className="p-3 text-center"
                style={{
                  borderRight: i < 6 ? '1px solid var(--border)' : undefined,
                  background: isToday(date) ? 'var(--accent)' : undefined,
                  color: isToday(date) ? '#fff' : 'var(--text-primary)',
                }}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ opacity: isToday(date) ? 1 : 0.5 }}>
                  {DAYS[i]}
                </div>
                <div className="text-lg font-bold mt-0.5">{date.getDate()}</div>
              </div>
            ))}
          </div>

          {/* Time slots */}
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8" style={{ borderBottom: '1px solid var(--border)', minHeight: 64 }}>
              <div
                className="p-2 text-xs font-medium text-right pr-3 pt-3"
                style={{ color: 'var(--text-tertiary)', borderRight: '1px solid var(--border)' }}
              >
                {hourLabel(hour)}
              </div>
              {DAYS.map((_, dayIndex) => {
                const atSlot = inWeek.filter((b) => {
                  const d = new Date(b.start);
                  return d.getDay() === dayIndex && d.getHours() === hour;
                });

                return (
                  <div
                    key={dayIndex}
                    className="p-1 relative min-h-[64px]"
                    style={{ borderRight: dayIndex < 6 ? '1px solid var(--border)' : undefined }}
                  >
                    {atSlot.map((b) => {
                      const lifecycle = getMeetingLifecycleState({ status: 'SCHEDULED', scheduledStart: b.start });
                      const isPast = lifecycle === 'COMPLETED' || lifecycle === 'EXPIRED';
                      const isLive = lifecycle === 'LIVE';

                      const tileContent = (
                        <>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold truncate">{b.studentName}</span>
                            {isLive && (
                              <span className="relative flex h-2 w-2 shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                              </span>
                            )}
                          </div>
                          <div className="truncate opacity-90">
                            {new Date(b.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        </>
                      );

                      if (isPast) {
                        return (
                          <div
                            key={b.id}
                            className="block rounded-lg p-2 text-white text-[10px] cursor-default mb-1 leading-tight shadow-xs opacity-60 grayscale-[40%]"
                            style={{ background: getStudentColor(b.studentId) }}
                            title="Class completed / expired"
                          >
                            {tileContent}
                          </div>
                        );
                      }

                      return (
                        <Link
                          key={b.id}
                          href={`/dashboard/session/${b.sessionId}`}
                          className="block rounded-lg p-2 text-white text-[10px] cursor-pointer transition-transform hover:scale-[1.02] mb-1 leading-tight shadow-sm"
                          style={{ background: getStudentColor(b.studentId) }}
                        >
                          {tileContent}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      )}

      <p className="text-xs mt-3" style={{ color: 'var(--text-tertiary)' }}>
        All times shown in your local timezone{tz ? ` (${tz})` : ''}.
      </p>
    </>
  );
}
