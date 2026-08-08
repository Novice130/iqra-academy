'use client';

/**
 * Guest knock prompt — "Ahmed wants to join", with Admit / Deny.
 *
 * Only mounted for the host. Sits top-centre over the video rather than in a
 * panel: a guest is standing at the door waiting, so it has to be seen
 * without anyone going looking for it.
 */

import { useEffect, useState } from 'react';

// 10s, not 4: this is the one poll that runs continuously for every host for
// the whole length of a class, and it was the top source of the requests that
// put the worker over its memory limit. A guest waiting ten seconds at the
// door is a fair trade for the class not going down.
const POLL_INTERVAL_MS = 10000;

interface WaitingGuest {
  id: string;
  name: string;
  askedAt: string;
}

export default function GuestKnockPrompt({ sessionId }: { sessionId: string }) {
  const [guests, setGuests] = useState<WaitingGuest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      // Nobody can admit a guest from a tab they aren't looking at, and this
      // poll runs for the whole length of every class — it was the single
      // biggest source of load when the worker hit its resource limit.
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/guests`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setGuests(data.guests || []);
      } catch {
        // Best-effort poll.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    // Someone waiting at the door while the host was away in another tab has
    // to appear the moment the host comes back, not up to an interval later.
    document.addEventListener('visibilitychange', poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [sessionId]);

  const respond = async (id: string, action: 'admit' | 'deny') => {
    setBusy(id);
    // Drop it from the list immediately — the poll would otherwise show the
    // guest again for up to 4s after the host has already decided.
    setGuests((prev) => prev.filter((g) => g.id !== id));
    try {
      await fetch(`/api/sessions/${sessionId}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id, action }),
      });
    } catch {
      // If it failed, the next poll brings them back.
    } finally {
      setBusy(null);
    }
  };

  if (guests.length === 0) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,360px)] space-y-2">
      {guests.map((g) => (
        <div
          key={g.id}
          className="flex items-center gap-3 px-3 py-2.5 rounded-2xl"
          style={{
            background: '#26282c',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
            animation: 'lk-pop-in 200ms ease-out',
          }}
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0"
            style={{ background: '#3c4043', color: '#fff' }}
          >
            {g.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white truncate">{g.name}</div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
              wants to join
            </div>
          </div>
          <button
            onClick={() => respond(g.id, 'deny')}
            disabled={busy === g.id}
            className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer shrink-0"
            style={{ background: 'rgba(255,255,255,0.1)', color: '#e8eaed' }}
          >
            Deny
          </button>
          <button
            onClick={() => respond(g.id, 'admit')}
            disabled={busy === g.id}
            className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer shrink-0"
            style={{ background: '#8ab4f8', color: '#202124' }}
          >
            Admit
          </button>
        </div>
      ))}
    </div>
  );
}
