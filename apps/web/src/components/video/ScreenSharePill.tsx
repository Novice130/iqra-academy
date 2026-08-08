'use client';

/**
 * "Live — sharing your screen", with a Stop button, over the call.
 *
 * Only for the native Android share. In a browser the tab already carries its
 * own "you are sharing" bar and a second one would be noise; on the phone
 * there is nothing on the call screen to say the share is still running, and
 * a teacher who has come back to the app needs to be able to stop it without
 * hunting through the control bar.
 *
 * The companion to this is the ongoing notification, which is what they can
 * reach while they are in whatever app they are actually presenting.
 */

import { useEffect, useState } from 'react';
import { getNativeSharing, stopNativeScreenShare, subscribeNativeSharing } from './nativeScreenShare';

export default function ScreenSharePill() {
  const [sharing, setSharing] = useState(getNativeSharing);

  useEffect(() => subscribeNativeSharing(setSharing), []);

  if (!sharing) return null;

  return (
    <div
      className="absolute z-[60] flex items-center gap-2 rounded-full"
      style={{
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(20,21,24,0.92)',
        border: '1px solid rgba(255,255,255,0.14)',
        padding: '6px 6px 6px 12px',
        // Inline, not className: the call screen's floating pieces have been
        // caught out by utility classes before.
        boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#ea4335',
          boxShadow: '0 0 0 3px rgba(234,67,53,0.25)',
        }}
      />
      <span style={{ color: '#e8eaed', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
        Live · sharing your screen
      </span>
      <button
        type="button"
        onClick={() => {
          // Optimistic: the button has to stop looking live the instant it is
          // pressed, and the shell confirms by calling __ntScreenShareEnded.
          stopNativeScreenShare().catch(() => {});
        }}
        className="rounded-full cursor-pointer"
        style={{
          background: '#ea4335',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          padding: '6px 12px',
          whiteSpace: 'nowrap',
        }}
      >
        Stop sharing
      </button>
    </div>
  );
}
