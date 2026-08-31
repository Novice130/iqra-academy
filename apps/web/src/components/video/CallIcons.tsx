'use client';

/**
 * Call icons — inline SVG, no icon dependency and nothing to fetch.
 * All are 24x24, `currentColor`, so a button just sets `color`.
 */

type P = { className?: string };

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const MicIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="2.5" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
    <path d="M12 17.5V21" />
  </svg>
);

export const MicOffIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 5a3 3 0 0 1 6 0v4" />
    <path d="M15 12.5a3 3 0 0 1-5.2 2" />
    <path d="M5.5 11a6.5 6.5 0 0 0 10 5.5" />
    <path d="M12 17.5V21" />
    <path d="M3.5 3.5l17 17" />
  </svg>
);

export const CameraIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
    <path d="M15.5 10.5l6-3.5v10l-6-3.5z" />
  </svg>
);

export const CameraOffIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M15.5 10.5l6-3.5v10l-3-1.75" />
    <path d="M13 6h-8a2.5 2.5 0 0 0-2.5 2.5v7A2.5 2.5 0 0 0 5 18h8.5" />
    <path d="M3.5 3.5l17 17" />
  </svg>
);

export const ScreenShareIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="4" width="19" height="13" rx="2" />
    <path d="M8 21h8" />
    <path d="M12 13.5V8m0 0l-2.2 2.2M12 8l2.2 2.2" />
  </svg>
);

export const FramePersonIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7V4h3M17 4h3v3M4 17v3h3M17 20h3v-3" strokeWidth={2} />
    <circle cx="12" cy="10" r="2.8" />
    <path d="M8 17.5a4 4 0 0 1 8 0" />
  </svg>
);

export const VisualEffectsSparkleIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M19 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
    <circle cx="8.5" cy="9.5" r="1.5" />
    <path d="m21 16-5-5L5 21" />
    <path d="M18.5 2.5v4M20.5 4.5h-4" strokeWidth={2} />
  </svg>
);

/**
 * Background effects: a person standing in front of a dashed frame — the
 * frame is what's being swapped out.
 */
export const EffectsIcon = VisualEffectsSparkleIcon;

export const SettingsIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47 1z" />
  </svg>
);

export const ChatIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

/** Single person with plus icon — for inviting/adding someone to the call */
export const PeopleIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" y1="8" x2="19" y2="14" />
    <line x1="16" y1="11" x2="22" y2="11" />
  </svg>
);

export const UserPlusIcon = PeopleIcon;

export const MoreIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" />
  </svg>
);

/** One big frame and two small ones — the speaker/gallery choice itself. */
export const LayoutIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="5" width="12" height="14" rx="2" />
    <rect x="16.5" y="5" width="5" height="6" rx="1.5" />
    <rect x="16.5" y="13" width="5" height="6" rx="1.5" />
  </svg>
);

export const LeaveIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M2.5 12.5c5-4.7 14-4.7 19 0l-2.6 2.6-3.4-1.6v-2.3a11.7 11.7 0 0 0-7 0v2.3l-3.4 1.6z" />
  </svg>
);

export const ChevronUpIcon = (p: P) => (
  <svg {...base} width={14} height={14} {...p}>
    <path d="M6 14l6-6 6 6" />
  </svg>
);

export const FlipCameraIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 8.5A7.5 7.5 0 0 1 15.5 5" />
    <path d="M21 15.5A7.5 7.5 0 0 1 8.5 19" />
    <path d="M15.5 2.5V5.5h-3" />
    <path d="M8.5 21.5V18.5h3" />
  </svg>
);

/** A speaker with sound coming out of it — the per-student volume control. */
export const VolumeIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
    <path d="M18 7a7 7 0 0 1 0 10" />
  </svg>
);

/** The same speaker with the waves gone — a student turned all the way down. */
export const VolumeOffIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" />
    <path d="M16 9.5l5 5" />
    <path d="M21 9.5l-5 5" />
  </svg>
);

export const HandRaiseIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M18 11V6a2 2 0 0 0-4 0v4M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M6 14v1a6 6 0 0 0 12 0v-4a2 2 0 0 0-4 0v1" />
  </svg>
);

export const BackArrowIcon = (p: P) => (
  <svg {...base} {...p}>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export const PhoneCallIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

export const SpeakerIcon = (p: P) => (
  <svg {...base} {...p}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

export const PhoneSpeakerIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
    <line x1="12" y1="18" x2="12.01" y2="18" />
  </svg>
);

export const BluetoothIcon = (p: P) => (
  <svg {...base} {...p}>
    <polyline points="6.5 6.5 17.5 17.5 12 23 12 1 17.5 6.5 6.5 17.5" />
  </svg>
);

export const InfoIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const HostShieldIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const SparklesIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
  </svg>
);

/**
 * Three bars that bob while somebody is talking (animation lives in
 * globals.css so it can be disabled under prefers-reduced-motion).
 */
export const SpeakingBarsIcon = ({ className = '' }: { className?: string }) => (
  <svg viewBox="0 0 12 12" className={className} aria-hidden="true">
    {[
      { x: 1, delay: '0s' },
      { x: 5, delay: '0.15s' },
      { x: 9, delay: '0.3s' },
    ].map(({ x, delay }) => (
      <rect
        key={x}
        className="nt-speak-bar"
        x={x}
        y={2}
        width={2}
        height={8}
        rx={1}
        fill="currentColor"
        style={{ animationDelay: delay, transformOrigin: `${x + 1}px 6px` }}
      />
    ))}
  </svg>
);

