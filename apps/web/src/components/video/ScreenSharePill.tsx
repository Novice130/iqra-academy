'use client';

/**
 * ScreenSharePill — Apple Dynamic Island style indicator:
 * "Live · sharing your screen" with glowing red indicator and Stop button.
 */

import { useEffect, useState } from 'react';
import { getNativeSharing, stopNativeScreenShare, subscribeNativeSharing } from './nativeScreenShare';

export default function ScreenSharePill() {
  const [sharing, setSharing] = useState(getNativeSharing);

  useEffect(() => subscribeNativeSharing(setSharing), []);

  if (!sharing) return null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2.5 rounded-full pointer-events-auto shadow-2xl animate-fadeIn"
      style={{
        background: 'rgba(20, 22, 28, 0.88)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        padding: '5px 5px 5px 14px',
      }}
    >
      <span
        aria-hidden
        className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"
      />
      <span className="text-xs font-bold text-white tracking-tight whitespace-nowrap">
        Live · sharing your screen
      </span>
      <button
        type="button"
        onClick={() => {
          stopNativeScreenShare().catch(() => {});
        }}
        className="px-3.5 py-1.5 rounded-full text-xs font-bold text-white cursor-pointer transition active:scale-95 whitespace-nowrap"
        style={{
          background: 'linear-gradient(180deg, #ff453a 0%, #d70015 100%)',
          boxShadow: '0 2px 8px rgba(255, 69, 58, 0.4)',
          border: '1px solid rgba(255, 255, 255, 0.25)',
        }}
      >
        Stop sharing
      </button>
    </div>
  );
}
