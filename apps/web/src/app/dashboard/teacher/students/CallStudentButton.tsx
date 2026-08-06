'use client';

/**
 * Call Student Button — teacher "rings" one student directly.
 *
 * Polls the call's status on a fast interval (this is the ringing UX, unlike
 * the 20s general notification banner) and auto-navigates into the session
 * the moment the student accepts.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const POLL_INTERVAL_MS = 2000;
const RING_TIMEOUT_MS = 45000;

type CallState = 'idle' | 'calling' | 'declined' | 'no-answer' | 'error';

export default function CallStudentButton({
  studentProfileId,
  studentName,
}: {
  studentProfileId: string;
  studentName: string;
}) {
  const [state, setState] = useState<CallState>('idle');
  const callIdRef = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (state !== 'calling') return;

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (!callIdRef.current || cancelled) return;
      try {
        const res = await fetch(`/api/calls/${callIdRef.current}`);
        const data = await res.json();
        if (cancelled) return;

        if (data.status === 'ACCEPTED') {
          router.push(`/dashboard/session/${data.sessionId}`);
          return;
        }
        if (data.status === 'DECLINED') {
          setState('declined');
          return;
        }
        if (Date.now() - startedAt > RING_TIMEOUT_MS) {
          fetch(`/api/calls/${callIdRef.current}/cancel`, { method: 'POST' }).catch(() => {});
          setState('no-answer');
          return;
        }
      } catch {
        // Keep polling — a single failed check shouldn't drop the call.
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [state, router]);

  const startCall = async () => {
    // Drop the previous invite id before re-ringing — otherwise the poll can
    // read the *old* call's terminal status and instantly mark the new ring
    // as declined.
    callIdRef.current = null;
    setState('calling');
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentProfileId }),
      });
      const data = await res.json();
      if (!res.ok || !data.callId) {
        setState('error');
        return;
      }
      callIdRef.current = data.callId;
    } catch {
      setState('error');
    }
  };

  const hangUp = () => {
    if (callIdRef.current) {
      fetch(`/api/calls/${callIdRef.current}/cancel`, { method: 'POST' }).catch(() => {});
    }
    setState('idle');
  };

  if (state === 'idle' || state === 'error') {
    return (
      <button
        onClick={startCall}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white cursor-pointer"
        style={{ background: 'var(--accent)' }}
      >
        {state === 'error' ? 'Call failed — retry' : '📞 Call'}
      </button>
    );
  }

  if (state === 'calling') {
    return (
      <button
        onClick={hangUp}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer animate-pulse"
        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
      >
        Calling {studentName}…
      </button>
    );
  }

  // Declined / no-answer is a label, not a dead end — one tap rings again.
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        {state === 'declined' ? 'Declined' : 'No answer'}
      </span>
      <button
        onClick={startCall}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white cursor-pointer"
        style={{ background: 'var(--accent)' }}
      >
        📞 Call again
      </button>
    </div>
  );
}
