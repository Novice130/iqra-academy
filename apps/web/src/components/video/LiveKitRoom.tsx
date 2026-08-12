'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DisconnectReason } from 'livekit-client';
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
 * Hands the connection back when the page goes away.
 *
 * Without this the page just vanishes and the server keeps the participant
 * until it times them out. That ghost is how one student ended up in a class
 * twice: he tapped the "class has started" notification, the teacher then
 * rang him, and tapping Join navigated the same WebView to the call — the
 * first connection was still counted, so the room showed two of him, with two
 * live microphones in one room.
 *
 * Identities are unique per connection (`email#random`, see lib/livekit.ts),
 * so LiveKit's own duplicate eviction cannot catch this. The join API sweeps
 * up stale connections as a backstop; this stops most of them existing.
 *
 * `pagehide` rather than `beforeunload`: mobile Safari and Android WebViews
 * frequently skip the latter.
 */
function LeaveOnPageHide() {
  const room = useRoomContext();
  useEffect(() => {
    const leave = (event: PageTransitionEvent) => {
      // `persisted` means the page is being frozen into the back/forward
      // cache, not destroyed — the user pressed Back and can come straight
      // back to a live call. Hanging up there ends a class because someone
      // glanced at another page.
      if (event.persisted) return;
      // stopTracks so the camera light goes out immediately rather than
      // whenever the torn-down page is finally collected.
      room.disconnect(true).catch(() => {});
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [room]);
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

/**
 * iOS refuses to let script change playback volume: `HTMLMediaElement.volume`
 * is read-only in Safari and WKWebView, and volume is a hardware button only.
 * That would make the teacher's per-student slider move and do nothing on an
 * iPhone — the worst kind of broken, because it looks like it worked.
 *
 * `webAudioMix` routes remote audio through a Web Audio gain node instead,
 * which iOS *does* allow. It isn't the default everywhere because it also
 * takes over output routing, and `setSinkId` — how the pre-join screen's
 * speaker picker works — is unsupported on iOS anyway, so there is nothing to
 * lose there and something real to lose on desktop.
 */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
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
   * This connection's own LiveKit identity, from the join API. Sent back when
   * leaving so the right attendance row is closed — a teacher who is in the
   * room from a laptop and a phone has two open rows, and shutting the laptop
   * must not record the phone as having left too.
   */
  identity?: string | null;
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
  identity,
  onLeave,
}: LiveKitRoomProps) {
  const router = useRouter();
  useWakeLock();

  // See isIOS: without this the teacher's volume slider is decorative on an
  // iPhone. Empty deps — the browser doesn't change mid-call.
  const roomOptions = useMemo(() => ({ webAudioMix: isIOS() }), []);

  /**
   * True while the page is frozen in the back/forward cache. The browser
   * closes the WebSocket on the way in, so LiveKit reports a disconnect for a
   * call the user has not left — without this a student pressing Back lands
   * on the dashboard and a teacher's class is marked COMPLETED.
   */
  const frozenRef = useRef(false);
  /** Bumped on bfcache restore to remount LKRoom, which reconnects it. */
  const [connectKey, setConnectKey] = useState(0);
  /** Set once this connection is superseded, so unloading can't end the class. */
  const supersededRef = useRef(false);

  useEffect(() => {
    const onHide = (event: PageTransitionEvent) => {
      if (event.persisted) frozenRef.current = true;
    };
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      frozenRef.current = false;
      setConnectKey((k) => k + 1);
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  /**
   * Close this connection's attendance row.
   *
   * Everyone sends this, not just the host: the point of the record is when
   * each *student* left, and a student disconnecting has never told the server
   * anything at all. `keepalive` so it still goes out if the page is being
   * dismantled around it.
   */
  const recordLeave = useCallback(
    (beacon = false) => {
      const url = `/api/sessions/${sessionId}/leave`;
      const payload = JSON.stringify({ identity });
      if (beacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
        return;
      }
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    },
    [sessionId, identity]
  );

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    // Frozen, not gone. Reconnected on `pageshow`.
    if (frozenRef.current) return;

    // Removed by the server. Either a host kicked this person, or — far more
    // often — they rejoined from another device and the join API swept this
    // connection up as a ghost. Neither means the class is over: a teacher
    // rejoining on their phone used to have their own laptop evicted, which
    // then POSTed /end and dropped every student in the room.
    if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
      supersededRef.current = true;
      // The class carries on, but *this connection* is over either way —
      // kicked or replaced — so its attendance row closes here.
      recordLeave();
      if (onLeave) {
        onLeave();
        return;
      }
      router.push('/dashboard');
      return;
    }

    // Only the session's own teacher ending the call marks it done. This
    // used to key off isModerator, which is also true for an ORG_ADMIN /
    // SUPER_ADMIN observing someone else's class — so an admin dropping out
    // of a room closed the LiveKit room and ended the lesson for the teacher
    // and students still in it. Students disconnecting never ended it.
    if (isHost) {
      fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    }
    recordLeave();
    if (onLeave) {
      onLeave();
      return;
    }
    router.push('/dashboard');
  }, [isHost, sessionId, router, onLeave, recordLeave]);

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
    const endOnClose = (event: PageTransitionEvent) => {
      // Frozen into the back/forward cache, or already replaced by this
      // teacher's connection on another device — the class carries on
      // either way, so it must not be ended here.
      if (event.persisted || supersededRef.current) return;
      navigator.sendBeacon?.(`/api/sessions/${sessionId}/end`);
    };
    window.addEventListener('pagehide', endOnClose);
    return () => window.removeEventListener('pagehide', endOnClose);
  }, [isHost, sessionId]);

  /**
   * The same story for attendance, and for everybody rather than just the
   * host. `handleDisconnected` only fires on a clean leave; a student who
   * swipes the app away or whose phone dies never reaches it, and their row
   * would sit open forever showing them as still in a class that finished
   * hours ago.
   *
   * This is still only the fast path. The LiveKit `participant_left` webhook
   * is what actually catches the killed app — it just arrives seconds later.
   */
  useEffect(() => {
    const leaveOnClose = (event: PageTransitionEvent) => {
      // Frozen into the back/forward cache — they can come straight back to a
      // live call. Or already superseded, in which case the row was closed
      // when the server dropped this connection.
      if (event.persisted || supersededRef.current) return;
      recordLeave(true);
    };
    window.addEventListener('pagehide', leaveOnClose);
    return () => window.removeEventListener('pagehide', leaveOnClose);
  }, [recordLeave]);

  return (
    <LKRoom
      // Remounting is the reconnect: coming back from the back/forward cache
      // leaves a dead Room whose connect effect never re-runs, so the call UI
      // sits there frozen. A new key builds a fresh Room on the same token.
      key={connectKey}
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
      // Computed once per mount rather than inline: a fresh options object on
      // every render would tear down and rebuild the Room.
      options={roomOptions}
      data-lk-theme="default"
      style={{ height: '100dvh' }}
      onDisconnected={handleDisconnected}
    >
      <ApplyAudioOutput deviceId={choices.audioOutputDeviceId} />
      <LeaveOnPageHide />
      <CustomVideoConference
        isModerator={isModerator}
        sessionId={sessionId}
        teacherIdentity={teacherIdentity}
        initialEffect={choices.backgroundEffect}
      />
    </LKRoom>
  );
}
