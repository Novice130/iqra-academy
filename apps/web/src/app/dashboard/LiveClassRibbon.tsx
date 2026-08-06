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

const POLL_INTERVAL_MS = 15000;

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

    const poll = async () => {
      try {
        const res = await fetch('/api/students/live-class');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setLive(data.live || null);
      } catch {
        // Best-effort background poll.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
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
