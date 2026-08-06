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

import { useEffect, useState } from 'react';

export type LocalTimeMode = 'time' | 'weekday-time' | 'date-time' | 'date';

const OPTIONS: Record<LocalTimeMode, Intl.DateTimeFormatOptions> = {
  time: { hour: 'numeric', minute: '2-digit' },
  'weekday-time': { weekday: 'long', hour: 'numeric', minute: '2-digit' },
  'date-time': { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  date: { month: 'short', day: 'numeric' },
};

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

/** The viewer's IANA zone, e.g. "America/Chicago". Empty string on the server. */
export function useViewerTimeZone() {
  const [tz, setTz] = useState('');
  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch {
      setTz('');
    }
  }, []);
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
  const [text, setText] = useState(() => formatInZone(iso, mode, withZone, 'UTC'));

  useEffect(() => {
    setText(formatInZone(iso, mode, withZone));
  }, [iso, mode, withZone]);

  return <>{text}</>;
}
