'use client';

/**
 * Guest knock prompt — Apple Dynamic Island style floating notification card:
 * "Ahmed wants to join", with Admit / Deny.
 */

import { useEffect, useState, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 4000;

/**
 * Knock-knock sound when a new guest appears. Synthesised with WebAudio so
 * there is no asset to host, same approach as the entry/exit chimes in
 * CustomVideoConference. Browsers block audio until the user has interacted
 * with the page; since the host is the one who started the class, a tap on
 * the call screen is all it takes to unlock — so the context is created
 * lazily and resumed on the first pointerdown if it starts suspended.
 */
function useKnockSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const unlockArmed = useRef(false);

  const ensureCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!ctxRef.current) {
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        ctxRef.current = new Ctx();
      } catch {
        return null;
      }
    }
    if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  // If autoplay policy keeps the context suspended, the first tap anywhere
  // resumes it — after that knocks sound without further interaction.
  useEffect(() => {
    const arm = () => {
      if (unlockArmed.current) return;
      unlockArmed.current = true;
      ensureCtx();
      window.removeEventListener('pointerdown', arm);
    };
    window.addEventListener('pointerdown', arm);
    return () => window.removeEventListener('pointerdown', arm);
  }, [ensureCtx]);

  return useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx || ctx.state !== 'running') return;
    try {
      const knock = (at: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(160, ctx.currentTime + at);
        osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + at + 0.09);
        gain.gain.setValueAtTime(0, ctx.currentTime + at);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.11);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.13);
      };
      knock(0);
      knock(0.16); // the second knock — "knock-knock"
    } catch {
      // Best-effort: a silent prompt is better than a broken one.
    }
  }, [ensureCtx]);
}

interface WaitingGuest {
  id: string;
  name: string;
  askedAt: string;
}

export default function GuestKnockPrompt({ sessionId }: { sessionId: string }) {
  const [guests, setGuests] = useState<WaitingGuest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const answeredNames = useRef<Set<string>>(new Set());
  const seenNames = useRef<Set<string>>(new Set());
  const playKnock = useKnockSound();

  // Sound once per newly-knocking guest, not on every poll re-render.
  useEffect(() => {
    for (const g of guests) {
      const key = g.name.toLowerCase().trim();
      if (!seenNames.current.has(key)) {
        seenNames.current.add(key);
        playKnock();
      }
    }
  }, [guests, playKnock]);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await fetch(`/api/sessions/${sessionId}/guests`);
        if (!res.ok) {
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          const rawList: WaitingGuest[] = data.guests || [];
          // Deduplicate by name so the host only sees one prompt per person
          const dedupedMap = new Map<string, WaitingGuest>();
          for (const item of rawList) {
            const key = item.name.toLowerCase().trim();
            if (!dedupedMap.has(key) && !answeredNames.current.has(key)) {
              dedupedMap.set(key, item);
            }
          }
          setGuests(Array.from(dedupedMap.values()));
        }
      } catch {
        // Best-effort poll
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [sessionId]);

  const respond = async (guest: WaitingGuest, action: 'admit' | 'deny') => {
    setBusy(guest.id);
    // Remove this guest and any with the same name immediately
    const targetName = guest.name.toLowerCase().trim();
    answeredNames.current.add(targetName);
    seenNames.current.add(targetName);
    setGuests((prev) => prev.filter((g) => g.id !== guest.id && g.name.toLowerCase().trim() !== targetName));
    try {
      await fetch(`/api/sessions/${sessionId}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: guest.id, action }),
      });
    } catch {
      // Re-appears on next poll if failed
    } finally {
      setBusy(null);
    }
  };

  if (guests.length === 0) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,380px)] space-y-2 pointer-events-auto">
      {guests.map((g) => (
        <div
          key={g.id}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-3xl animate-fadeIn"
          style={{
            background: 'rgba(24, 26, 32, 0.90)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.35)',
            }}
          >
            {g.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-white truncate">{g.name}</div>
            <div className="text-[11px] text-neutral-400">wants to join this class</div>
          </div>
          <button
            onClick={() => respond(g, 'deny')}
            disabled={busy === g.id}
            className="px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer shrink-0 bg-white/10 text-neutral-300 hover:bg-white/15 transition"
          >
            Deny
          </button>
          <button
            onClick={() => respond(g, 'admit')}
            disabled={busy === g.id}
            className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white cursor-pointer shrink-0 transition active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
            }}
          >
            Admit
          </button>
        </div>
      ))}
    </div>
  );
}
