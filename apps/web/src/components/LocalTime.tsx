'use client';

/**
 * LocalTime — renders a stored timestamp in the *viewer's* timezone.
 *
 * WHY THIS EXISTS: every session time is stored as an absolute instant, but
 * the pages that showed them formatted server-side. On Cloudflare Workers the
 * server clock is UTC, so a 4:30 AM IST class rendered as "11:00 PM" for
 * everyone — teacher in India, students in Washington and Illinois alike.
 *
 * Formatting in the browser with Intl fixes it for free and stays correct
 * across DST: the US switches, India doesn't, and the IANA database that
 * every browser ships already knows the rules for the viewer's own zone. No
 * hardcoded offsets anywhere.
 *
 * HYDRATION: the first render deliberately formats in UTC so the server HTML
 * and the client's first pass agree, then an effect swaps in the local-zone
 * string. Doing it the other way round (or with suppressHydrationWarning)
 * either warns or leaves the stale UTC text on screen.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

/**
 * Where the zone we are rendering in came from. See lib/viewer-zone.ts.
 *
 * - `account` — they told us (users.timezone). Never second-guess it.
 * - `ip`      — Cloudflare placed their connection. Good enough to render,
 *               worth confirming once, and never written to the account
 *               without them saying so.
 * - `device`  — we don't know; the browser decides below.
 */
export type ViewerZoneSource = 'account' | 'ip' | 'device';

/**
 * The viewer's own zone, when we actually know it. Set from the dashboard
 * layout. A null `timeZone` means "trust the browser", which is right until
 * the device is wrong — a student in Illinois on a phone still set to India
 * time was shown 4:30 AM, their teacher's hour, not their own 6:00 PM. That
 * case is exactly what `source: 'ip'` now covers.
 */
const ViewerTimeZoneContext = createContext<{
  timeZone: string | null;
  source: ViewerZoneSource;
}>({ timeZone: null, source: 'device' });

export function ViewerTimeZoneProvider({
  timeZone,
  source = 'account',
  children,
}: {
  timeZone: string | null;
  /** Defaults to `account` so existing callers keep their old meaning. */
  source?: ViewerZoneSource;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ timeZone, source }), [timeZone, source]);
  return <ViewerTimeZoneContext.Provider value={value}>{children}</ViewerTimeZoneContext.Provider>;
}

/** The zone and where it came from — for UI that needs to explain itself. */
export function useViewerZoneSource(): { timeZone: string | null; source: ViewerZoneSource } {
  return useContext(ViewerTimeZoneContext);
}

export type LocalTimeMode =
  | 'time'
  | 'time-seconds'
  | 'weekday-time'
  | 'date-time'
  | 'date'
  | 'full-date';

const OPTIONS: Record<LocalTimeMode, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit' },
  // Attendance cares whether somebody was thirty seconds late or thirty
  // minutes, and a minute-resolution join time hides the difference between
  // "arrived with the teacher" and "arrived just after".
  'time-seconds': { hour: 'numeric', minute: '2-digit', second: '2-digit' },
  'weekday-time': { weekday: 'long', hour: 'numeric', minute: '2-digit' },
  'date-time': { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  date: { month: 'short', day: 'numeric' },
  'full-date': { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
};

/**
 * Which calendar day an instant falls on, **in the viewer's zone**, as
 * `YYYY-MM-DD`.
 *
 * A class at 23:00 UTC is Tuesday evening in Illinois and Wednesday morning in
 * India. Both are correct, so "group attendance by day" only has an answer
 * once you say whose day — and that answer can only be reached in the browser.
 * `en-CA` is used purely because it formats as ISO order.
 */
export function dayKeyInZone(value: string | Date, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

export function formatInZone(
  value: string | Date,
  mode: LocalTimeMode,
  withZone: boolean,
  timeZone?: string
) {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { ...OPTIONS[mode] };
  if (withZone && mode !== 'date') opts.timeZoneName = 'short';
  if (timeZone) opts.timeZone = timeZone;
  return new Intl.DateTimeFormat('en-US', opts).format(date);
}

/**
 * The viewer's IANA zone, e.g. "America/Chicago". Whatever the server resolved
 * (their account setting, else their IP) wins; otherwise fall back to the
 * device. Empty string on the server.
 */
export function useViewerTimeZone() {
  const { timeZone: accountZone } = useContext(ViewerTimeZoneContext);
  const [tz, setTz] = useState('');
  useEffect(() => {
    if (accountZone) {
      setTz(accountZone);
      return;
    }
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch {
      setTz('');
    }
  }, [accountZone]);
  return tz;
}

export default function LocalTime({
  iso,
  mode = 'time',
  withZone = false,
}: {
  /** ISO-8601 instant (use `date.toISOString()` when passing from a server component). */
  iso: string;
  mode?: LocalTimeMode;
  /** Append the zone abbreviation, e.g. "6:00 AM CDT". */
  withZone?: boolean;
}) {
  const { timeZone: accountZone } = useContext(ViewerTimeZoneContext);
  const [text, setText] = useState(() => formatInZone(iso, mode, withZone, 'UTC'));

  useEffect(() => {
    setText(formatInZone(iso, mode, withZone, accountZone || undefined));
  }, [iso, mode, withZone, accountZone]);

  return <>{text}</>;
}
