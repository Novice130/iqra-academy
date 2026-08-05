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
}

export default function LiveKitRoom({ token, url, sessionId, isModerator }: LiveKitRoomProps) {
  const router = useRouter();
  useWakeLock();

  const handleDisconnected = useCallback(() => {
    // Only the host ending the call marks the session done — a student
    // disconnecting shouldn't close the room for everyone else.
    if (isModerator) {
      fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    }
    router.push('/dashboard');
  }, [isModerator, sessionId, router]);

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
