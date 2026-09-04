'use client';

/**
 * @fileoverview Canonical Class Action Button
 *
 * Implements the single shared class action button across student home, teacher today list,
 * weekly schedule, notifications, and admin live cards.
 *
 * Enforces canonical lifecycle states:
 * - UPCOMING: Neutral time display / countdown; NO blue action before T-60.
 * - READY: Large blue #0A84FF action, minimum 48px high, video icon, "Start Class" / "Join Class".
 * - LIVE: Blue action with pulsating red live indicator; "Rejoin Class" / "Join Live Class" / "Observe Live".
 * - EXPIRED / COMPLETED / CANCELLED: Status chip, disabled action with zero dead navigation.
 *
 * @component ClassActionButton
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import {
  getClassActionState,
  type ClassActionSession,
  type ClassActionViewer,
} from '@/lib/class-action';

export interface ClassActionButtonProps {
  session: ClassActionSession;
  viewer: ClassActionViewer;
  variant?: 'prominent' | 'compact' | 'chip';
  className?: string;
  showDuration?: boolean;
  onAction?: () => void;
}

function VideoCameraIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function ClockIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default function ClassActionButton({
  session,
  viewer,
  variant = 'prominent',
  className = '',
  showDuration = false,
  onAction,
}: ClassActionButtonProps) {
  const router = useRouter();
  const actionState = useMemo(() => {
    return getClassActionState(session, viewer);
  }, [session, viewer]);

  const { state, label, actionUrl, disabled, durationText, countdownText } = actionState;

  const prefetchDestination = () => {
    if (!disabled && actionUrl) {
      router.prefetch(actionUrl);
    }
  };

  // 1. UPCOMING: Neutral time card / countdown badge. NO blue action before T-60.
  if (state === 'UPCOMING') {
    if (variant === 'compact' || variant === 'chip') {
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border)] cursor-default select-none ${className}`}
          aria-label={`Upcoming class: ${label}`}
        >
          <ClockIcon className="w-3.5 h-3.5 opacity-70" />
          <span>{label}</span>
          {showDuration && <span className="opacity-60">({durationText})</span>}
        </span>
      );
    }

    return (
      <div
        className={`inline-flex flex-col sm:flex-row items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border)] min-h-[48px] select-none text-center ${className}`}
        aria-label={`Class is upcoming: ${countdownText || label}`}
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <ClockIcon className="w-4 h-4 text-[var(--text-tertiary)]" />
          <span>{countdownText || 'Upcoming Class'}</span>
        </div>
        {showDuration && (
          <span className="text-xs text-[var(--text-tertiary)] font-normal">
            • {durationText}
          </span>
        )}
      </div>
    );
  }

  // 2. TERMINAL STATES: COMPLETED, CANCELLED, EXPIRED (Disabled status chip, prevents dead navigation)
  if (state === 'COMPLETED' || state === 'CANCELLED' || state === 'EXPIRED') {
    const chipColors =
      state === 'COMPLETED'
        ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700'
        : state === 'CANCELLED'
        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900';

    return (
      <span
        className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border ${chipColors} cursor-not-allowed select-none opacity-80 ${className}`}
        aria-label={`Class status: ${label}`}
      >
        <span>{label}</span>
      </span>
    );
  }

  // 3. READY or LIVE: Active, large blue #0A84FF action button with icon & prefetching
  const isLive = state === 'LIVE';
  const sizeClasses =
    variant === 'prominent'
      ? 'px-6 py-3 min-h-[48px] text-sm font-semibold rounded-xl'
      : 'px-3.5 py-1.5 text-xs font-semibold rounded-lg';

  return (
    <Link
      href={actionUrl}
      onClick={onAction}
      onMouseEnter={prefetchDestination}
      onTouchStart={prefetchDestination}
      onFocus={prefetchDestination}
      className={`inline-flex items-center justify-center gap-2.5 text-white shadow-sm transition active:scale-[0.98] hover:opacity-95 ${sizeClasses} ${className}`}
      style={{
        backgroundColor: '#0A84FF',
      }}
      aria-label={`${label} for ${session.title || 'class'}`}
    >
      {isLive ? (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
        </span>
      ) : (
        <VideoCameraIcon className={variant === 'prominent' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      )}
      <span>{label}</span>
      {showDuration && (
        <span className="text-white/80 text-xs font-normal">
          ({durationText})
        </span>
      )}
    </Link>
  );
}
