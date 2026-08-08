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
import { desktopCallHandled } from "@/lib/desktop";

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
    // The desktop app rings too, from the main process, so that a window in
    // the tray still rings. Both are looking at the same invite, so whichever
    // one the user answers has to silence the other.
    desktopCallHandled(call.id);
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
    desktopCallHandled(call.id);
    fetch(`/api/calls/${call.id}/decline`, { method: "POST" }).catch(() => {});
    setCall(null);
    setResponding(false);
  };

  if (!call) return null;

  return (
    <div style={styles.screen}>
      <style>{keyframes}</style>

      {/* The column is capped and centred rather than filling the viewport.
          Full-bleed is right on a phone and wrong on a 27" monitor, where it
          strands the buttons half a screen away from the name. */}
      <div style={styles.panel}>
        {/* Caller block sits in the upper half, as it does on a phone: the
            bottom belongs to the buttons, and a thumb should never have to
            travel past the name to reach them. */}
        <div style={styles.callerBlock}>
          <div style={styles.avatar}>{call.callerName.charAt(0).toUpperCase()}</div>
          <div style={styles.name}>{call.callerName}</div>
          <div style={styles.subtitle}>Novice Tutor video…</div>
        </div>

        <div style={styles.actions}>
          <CallButton
            onClick={decline}
            disabled={responding}
            label="Decline"
            color="#FF3B30"
            icon={<EndCallIcon />}
          />
          <CallButton
            onClick={accept}
            disabled={responding}
            label="Accept"
            color="#34C759"
            icon={<CallIcon />}
            nudge
          />
        </div>
      </div>
    </div>
  );
}

/**
 * One of the two round buttons, with its label underneath.
 *
 * The label is not decoration. A bare red circle and a bare green circle rely
 * entirely on colour to say which is which, which fails for the ~8% of men
 * with red-green colour blindness — and on a ringing phone there is no time to
 * work it out.
 */
function CallButton({
  onClick,
  disabled,
  label,
  color,
  icon,
  nudge = false,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  color: string;
  icon: React.ReactNode;
  nudge?: boolean;
}) {
  return (
    <div style={styles.action}>
      <button
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={nudge ? "nt-ring-nudge" : undefined}
        style={{
          ...styles.button,
          background: color,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {icon}
      </button>
      <span style={styles.actionLabel}>{label}</span>
    </div>
  );
}

function CallIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
    </svg>
  );
}

/** The same handset, rotated — how every phone has drawn "hang up" for years. */
function EndCallIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.51-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </svg>
  );
}

/* Answer hops every couple of seconds — the same cue a phone gives that the
   call is live and waiting, and the thing that tells the two buttons apart at
   a glance without reading either of them. */
const keyframes = `
@keyframes nt-ring-nudge {
  0%, 62%, 100% { transform: translateY(0); }
  70% { transform: translateY(-7px); }
  82% { transform: translateY(0); }
  90% { transform: translateY(-3px); }
}
.nt-ring-nudge { animation: nt-ring-nudge 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .nt-ring-nudge { animation: none; }
}
`;

/**
 * Inline styles rather than utility classes throughout: this screen has to
 * render correctly the first time on a phone that is ringing, and a class that
 * fails to apply here is a call nobody can answer.
 */
const styles: Record<string, React.CSSProperties> = {
  screen: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    justifyContent: "center",
    background: "linear-gradient(180deg, #1c1f26 0%, #0a0c10 100%)",
    // Keeps the buttons clear of the home indicator and the notch.
    padding: "calc(env(safe-area-inset-top, 0px) + 12vh) 24px calc(env(safe-area-inset-bottom, 0px) + 48px)",
    userSelect: "none",
  },
  panel: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 420,
    // On a phone this is simply the screen. On a desktop it stops the two
    // halves drifting apart.
    maxHeight: 460,
    height: "100%",
    margin: "auto 0",
  },
  callerBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  // Sizes are clamp(min, preferred, max) rather than fixed pixels: this
  // screen has to hold up on a 320px iPhone SE and on a desktop, and a 112px
  // avatar that is comfortable on one is overbearing on the other. The min is
  // the smallest that still reads; the max stops it ballooning on a monitor.
  avatar: {
    width: "clamp(84px, 24vw, 112px)",
    height: "clamp(84px, 24vw, 112px)",
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.14)",
    display: "grid",
    placeItems: "center",
    fontSize: "clamp(32px, 9vw, 44px)",
    fontWeight: 300,
    color: "rgba(255, 255, 255, 0.92)",
    marginBottom: "clamp(18px, 5vw, 28px)",
  },
  name: {
    // Big and light, the way a phone announces a caller — the name is the one
    // thing that has to be readable at arm's length.
    fontSize: "clamp(26px, 7.5vw, 34px)",
    lineHeight: 1.15,
    fontWeight: 400,
    color: "#fff",
    letterSpacing: "-0.01em",
    // A long name wraps instead of forcing the screen sideways.
    overflowWrap: "anywhere",
  },
  subtitle: {
    fontSize: "clamp(14px, 4vw, 17px)",
    marginTop: 8,
    color: "rgba(255, 255, 255, 0.6)",
  },
  actions: {
    display: "flex",
    // Pushed apart rather than sat side by side, so Decline is never a
    // mis-tap away from Accept.
    justifyContent: "space-between",
    width: "100%",
    maxWidth: "min(340px, 86%)",
  },
  action: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
  },
  button: {
    // Never below 64px: that is about the smallest a thumb hits reliably on a
    // phone being picked up in a hurry, and well above the 44px minimum.
    width: "clamp(64px, 19vw, 76px)",
    height: "clamp(64px, 19vw, 76px)",
    borderRadius: "50%",
    border: 0,
    display: "grid",
    placeItems: "center",
    color: "#fff",
    cursor: "pointer",
    padding: 0,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
  },
  actionLabel: {
    fontSize: "clamp(13px, 3.6vw, 14px)",
    color: "rgba(255, 255, 255, 0.85)",
  },
};
