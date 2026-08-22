'use client';

/**
 * Live Class Ribbon — persistent "your teacher is in the room right now"
 * bar across the top of every dashboard page for students.
 *
 * Distinct from MeetingNotificationBanner: that one shows a one-shot
 * notification row and disappears once read, and it only ever existed if the
 * teacher happened to pre-select the student before starting. This polls the
 * teacher's *actual* live session, so it appears no matter how the meeting
 * was started and stays up for as long as the class is running.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Used until the server has answered once, and by nothing else.
 *
 * The cadence is the server's to choose — it is the only party that knows when
 * the answer could next change (see `lib/poll-cadence.ts`). A fixed 15s here is
 * what had every idle dashboard in the org asking four times a minute all day,
 * which is a meaningful share of the load that produced the 1102s of 6-7 August.
 */
const FALLBACK_INTERVAL_MS = 15000;

interface LiveClass {
  sessionId: string;
  teacherName: string;
  title: string | null;
  startedAt: string | null;
}

export default function LiveClassRibbon() {
  const [live, setLive] = useState<LiveClass | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A self-rescheduling timeout rather than setInterval: the gap is decided
    // by each answer, and setInterval has no way to change it.
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      let nextMs = FALLBACK_INTERVAL_MS;
      try {
        const res = await fetch('/api/students/live-class');
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setLive(data.live || null);
          const hinted = Number(data?.poll?.liveSeconds);
          if (Number.isFinite(hinted) && hinted > 0) {
            nextMs = Math.min(Math.max(hinted, 10), 1800) * 1000;
          }
        }
      } catch {
        // Best-effort background poll.
      }
      if (!cancelled) timer = setTimeout(poll, nextMs);
    };

    poll();

    // A tab that was in the background missed however long it was hidden, and
    // the first thing it shows on the way back would be that stale answer.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || cancelled) return;
      clearTimeout(timer);
      poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!live) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3"
      style={{ background: '#0a8967', color: 'white' }}
    >
      <span className="text-sm font-medium flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full animate-pulse"
          style={{ background: '#fff' }}
        />
        {live.teacherName} has started the class
      </span>
      <Link
        href={`/dashboard/session/${live.sessionId}`}
        className="shrink-0 px-4 py-1.5 rounded-lg text-xs font-bold"
        style={{ background: 'rgba(255,255,255,0.22)' }}
      >
        Join Meeting
      </Link>
    </div>
  );
}
