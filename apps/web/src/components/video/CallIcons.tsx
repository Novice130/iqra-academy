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

/**
 * Background effects: a person standing in front of a dashed frame — the
 * frame is what's being swapped out. The old glyph was a person with a
 * sparkle, which read as "add someone to the call" sitting two buttons away
 * from the People button.
 */
export const EffectsIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2.5" y="3.5" width="19" height="17" rx="3" strokeDasharray="3.2 2.6" />
    <circle cx="12" cy="10" r="2.7" />
    <path d="M7.3 17.6a5 5 0 0 1 9.4 0" />
  </svg>
);

export const ChatIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M20.5 12.5a7.5 7.5 0 0 1-10.9 6.7L4 20.5l1.4-5A7.5 7.5 0 1 1 20.5 12.5z" />
  </svg>
);

export const PeopleIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19a6 6 0 0 1 12 0" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3" />
    <path d="M17.5 14.2A5.6 5.6 0 0 1 21 19" />
  </svg>
);

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
