'use client';

import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom as LKRoom,
} from '@livekit/components-react';
import '@livekit/components-styles';
import CustomVideoConference from './CustomVideoConference';

/**
 * Keeps the screen awake for the duration of the call — otherwise the OS's
 * normal auto-lock timeout kills the screen mid-class, unlike Zoom/Meet/
 * WhatsApp which all hold a wake lock while a call is active. The lock is
 * released automatically by the browser when the tab goes to the
 * background, so it has to be re-acquired on visibilitychange.
 */
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;

    const acquire = async () => {
      try {
        sentinel = await (navigator as Navigator & { wakeLock: WakeLock }).wakeLock.request('screen');
      } catch {
        // Not fatal — permission can be denied (e.g. low battery mode); the
        // call still works, the screen just times out like normal.
      }
    };

    acquire();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && sentinel === null) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      sentinel?.release().catch(() => {});
    };
  }, []);
}

interface LiveKitRoomProps {
  token: string;
  url: string;
  sessionId: string;
  isModerator: boolean;
  /** True only for the session's own teacher — see handleDisconnected. */
  isHost: boolean;
}

export default function LiveKitRoom({ token, url, sessionId, isModerator, isHost }: LiveKitRoomProps) {
  const router = useRouter();
  useWakeLock();

  const handleDisconnected = useCallback(() => {
    // Only the session's own teacher ending the call marks it done. This
    // used to key off isModerator, which is also true for an ORG_ADMIN /
    // SUPER_ADMIN observing someone else's class — so an admin dropping out
    // of a room closed the LiveKit room and ended the lesson for the teacher
    // and students still in it. Students disconnecting never ended it.
    if (isHost) {
      fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    }
    router.push('/dashboard');
  }, [isHost, sessionId, router]);

  return (
    <LKRoom
      serverUrl={url}
      token={token}
      connect={true}
      video={true}
      audio={true}
      data-lk-theme="default"
      style={{ height: '100dvh' }}
      onDisconnected={handleDisconnected}
    >
      <CustomVideoConference isModerator={isModerator} sessionId={sessionId} />
    </LKRoom>
  );
}
