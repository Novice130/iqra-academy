'use client';

/**
 * Incoming Call Overlay — fullscreen ring UI when a teacher calls directly.
 *
 * Polls on a fast interval (this is the "ringing" experience, distinct from
 * the slower general MeetingNotificationBanner poll). Ringtone is synthesized
 * with the Web Audio API so no audio asset is needed.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 2500;

interface IncomingCall {
  id: string;
  sessionId: string;
  callerName: string;
}

export default function IncomingCallOverlay() {
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [responding, setResponding] = useState(false);
  const router = useRouter();
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (responding) return;
      // A backgrounded tab can't ring anyway — it has no audio and nobody is
      // looking at it — and every dashboard left open was spending 24
      // requests a minute here around the clock. That standing load is what
      // the worker ran out of room for when a class started. Push (FCM) is
      // what reaches a user who isn't on the page.
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch("/api/calls/incoming");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setCall(data.call || null);
      } catch {
        // Best-effort poll — ignore transient failures.
      }
    };

    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    // Coming back to the tab must not wait out the interval: a call that
    // arrived while it was hidden should be on screen immediately.
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [responding]);

  useEffect(() => {
    if (!call) {
      stopRingtone();
      return;
    }
    startRingtone();
    return () => stopRingtone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call?.id]);

  const startRingtone = () => {
    if (ringIntervalRef.current) return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;

    const playTone = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    };

    playTone();
    ringIntervalRef.current = setInterval(playTone, 1000);
  };

  const stopRingtone = () => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const accept = async () => {
    if (!call) return;
    setResponding(true);
    stopRingtone();
    try {
      const res = await fetch(`/api/calls/${call.id}/accept`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.sessionId) {
        // ?answer=1 skips the device-picker screen. Someone who just tapped
        // "Answer" has answered — a second setup step in front of a teacher
        // who is already waiting reads as the call not connecting.
        router.push(`/dashboard/session/${data.sessionId}?answer=1`);
        return;
      }
    } catch {
      // Fall through to reset below.
    }
    setCall(null);
    setResponding(false);
  };

  const decline = async () => {
    if (!call) return;
    setResponding(true);
    stopRingtone();
    fetch(`/api/calls/${call.id}/decline`, { method: "POST" }).catch(() => {});
    setCall(null);
    setResponding(false);
  };

  if (!call) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 p-6"
      style={{ background: "rgba(10, 12, 16, 0.92)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white animate-pulse"
        style={{ background: "var(--accent)" }}
      >
        {call.callerName.charAt(0).toUpperCase()}
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-white">{call.callerName}</div>
        <div className="text-sm text-slate-400 mt-1">is calling you…</div>
      </div>
      <div className="flex items-center gap-4 mt-4">
        <button
          onClick={decline}
          disabled={responding}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white cursor-pointer disabled:opacity-50"
          style={{ background: "#ef4444" }}
          aria-label="Decline"
        >
          ✕
        </button>
        <button
          onClick={accept}
          disabled={responding}
          className="w-14 h-14 rounded-full flex items-center justify-center text-white cursor-pointer disabled:opacity-50"
          style={{ background: "#22c55e" }}
          aria-label="Accept"
        >
          ✓
        </button>
      </div>
    </div>
  );
}
