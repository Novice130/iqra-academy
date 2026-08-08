'use client';

import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LiveKitRoom as LKRoom,
  useRoomContext,
} from '@livekit/components-react';
import '@livekit/components-styles';
import CustomVideoConference from './CustomVideoConference';
import { setDesktopCallActive } from '@/lib/desktop';
import type { JoinChoices } from './PreJoinScreen';

/**
 * Applies the speaker picked on the pre-join screen. Output device can only
 * be set on a connected Room, so it can't ride along on LiveKitRoom's
 * video/audio props the way the camera and mic do.
 */
function ApplyAudioOutput({ deviceId }: { deviceId?: string }) {
  const room = useRoomContext();
  useEffect(() => {
    if (!deviceId) return;
    room.switchActiveDevice('audiooutput', deviceId).catch(() => {});
  }, [room, deviceId]);
  return null;
}

/**
 * Keeps the screen awake for the duration of the call — otherwise the OS's
 * normal auto-lock timeout kills the screen mid-class, unlike Zoom/Meet/
 * WhatsApp which all hold a wake lock while a call is active. The lock is
 * released automatically by the browser when the tab goes to the
 * background, so it has to be re-acquired on visibilitychange.
 */
function useWakeLock() {
  // The desktop app blocks display sleep from its main process for as long as
  // this component is mounted. That is the half a browser cannot do: the
  // Screen Wake Lock below is released the moment the window is backgrounded,
  // and a class minimised to the tray is still a class.
  useEffect(() => {
    setDesktopCallActive(true);
    return () => setDesktopCallActive(false);
  }, []);

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
  /** Camera/mic/speaker picked on the pre-join screen. */
  choices: JoinChoices;
  /** The class teacher's identity — what a student's view focuses by default. */
  teacherIdentity: string | null;
  /**
   * Where to send someone once the room closes. Defaults to the dashboard,
   * which is right for anyone with an account and wrong for a guest — the
   * auth middleware bounces them to a login page they can't use.
   */
  onLeave?: () => void;
}

export default function LiveKitRoom({
  token,
  url,
  sessionId,
  isModerator,
  isHost,
  choices,
  teacherIdentity,
  onLeave,
}: LiveKitRoomProps) {
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
    if (onLeave) {
      onLeave();
      return;
    }
    router.push('/dashboard');
  }, [isHost, sessionId, router, onLeave]);

  /**
   * The handler above only runs on a clean disconnect. A teacher who closes
   * the tab, or whose phone kills the browser, never reaches it — which is
   * how a class sat IN_PROGRESS for five hours after everyone had gone home,
   * with the LiveKit room open and billing.
   *
   * `pagehide` fires in the cases `beforeunload` misses on mobile, and
   * sendBeacon survives the page being torn down mid-request.
   */
  useEffect(() => {
    if (!isHost) return;
    const endOnClose = () => {
      navigator.sendBeacon?.(`/api/sessions/${sessionId}/end`);
    };
    window.addEventListener('pagehide', endOnClose);
    return () => window.removeEventListener('pagehide', endOnClose);
  }, [isHost, sessionId]);

  return (
    <LKRoom
      serverUrl={url}
      token={token}
      connect={true}
      // Honour the pre-join screen. This used to be hardcoded true/true, so
      // joining with the camera or mic switched off turned them straight
      // back on the moment the room connected.
      video={
        choices.videoEnabled ? (choices.videoDeviceId ? { deviceId: choices.videoDeviceId } : true) : false
      }
      audio={
        choices.audioEnabled ? (choices.audioDeviceId ? { deviceId: choices.audioDeviceId } : true) : false
      }
      data-lk-theme="default"
      style={{ height: '100dvh' }}
      onDisconnected={handleDisconnected}
    >
      <ApplyAudioOutput deviceId={choices.audioOutputDeviceId} />
      <CustomVideoConference
        isModerator={isModerator}
        sessionId={sessionId}
        teacherIdentity={teacherIdentity}
        initialEffect={choices.backgroundEffect}
      />
    </LKRoom>
  );
}
