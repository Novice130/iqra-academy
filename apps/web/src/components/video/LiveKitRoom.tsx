'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DisconnectReason, VideoPresets } from 'livekit-client';
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
 * Traps browser / mobile hardware back button and swipe-back gestures while in call.
 * Ensures accidental back navigation NEVER kicks the participant out of the classroom.
 * The only way to leave is by explicitly tapping the End/Leave button.
 */
function usePreventBackNavigation() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Push state so back gesture hits our trap
    window.history.pushState({ inLiveKitCall: true }, '', window.location.href);

    const handlePop = () => {
      // When back is pressed or swiped, push state right back immediately
      window.history.pushState({ inLiveKitCall: true }, '', window.location.href);
    };

    window.addEventListener('popstate', handlePop);
    return () => {
      window.removeEventListener('popstate', handlePop);
    };
  }, []);
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
 * Phones refuse to let script change playback volume. On iOS
 * `HTMLMediaElement.volume` is read-only in Safari and WKWebView; Chromium
 * ignores the setter on Android too, in Chrome and in the app's WebView alike.
 * Either way volume is a hardware button only, which would make the teacher's
 * per-student slider move and do nothing — the worst kind of broken, because
 * it looks like it worked.
 *
 * `webAudioMix` routes remote audio through a Web Audio gain node instead,
 * which both platforms *do* allow. It isn't the default everywhere because it
 * also takes over output routing, and `setSinkId` — how the pre-join screen's
 * speaker picker works — is unsupported on mobile anyway, so there is nothing
 * to lose there and something real to lose on desktop.
 *
 * The cost of the mix path is that its AudioContext can come up suspended;
 * `useAudioPlaybackUnlock` in CustomVideoConference catches that.
 */
function needsWebAudioMix(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)|Android/.test(navigator.userAgent) ||
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
  teacherName?: string | null;
  joinCode?: string | null;
  sessionTitle?: string | null;
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
  teacherName,
  joinCode,
  sessionTitle,
  identity,
  onLeave,
}: LiveKitRoomProps) {
  const router = useRouter();
  useWakeLock();

  // See needsWebAudioMix: without this the teacher's volume slider is
  // decorative on a phone. Empty deps — the browser doesn't change mid-call.
  const roomOptions = useMemo(() => ({ webAudioMix: needsWebAudioMix() }), []);

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
  /**
   * The only thing that ends a class.
   *
   * Set by the host *tapping* End class, and by nothing else. Every other way
   * out of a room — a tunnel, a dead battery, the OS reclaiming the WebView —
   * leaves the class running so they can come back to it. Before this, any
   * disconnect at all from the teacher marked the row COMPLETED and deleted
   * the LiveKit room out from under the students still in it.
   *
   * The button press has to be the signal rather than the disconnect reason:
   * `LeaveOnPageHide` also calls `room.disconnect()`, so a killed app arrives
   * here as CLIENT_INITIATED too and is indistinguishable at this level.
   */
  const endOnDisconnectRef = useRef(false);
  usePreventBackNavigation();

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

  const navigateAway = useCallback(() => {
    try {
      if (onLeave) {
        onLeave();
      } else {
        router.push('/dashboard');
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.location.pathname.includes('/session/')) {
            window.location.href = '/dashboard';
          }
        }, 300);
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.location.href = '/dashboard';
      }
    }
  }, [onLeave, router]);

  const handleDisconnected = useCallback((reason?: DisconnectReason) => {
    if (frozenRef.current) return;

    if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
      supersededRef.current = true;
      recordLeave();
      navigateAway();
      return;
    }

    if (isHost && endOnDisconnectRef.current) {
      fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => {});
    }
    recordLeave();
    navigateAway();
  }, [isHost, sessionId, navigateAway, recordLeave]);

  /**
   * There is deliberately no `pagehide` handler ending the class any more.
   *
   * It used to beacon /end whenever the host's page went away, to stop a class
   * sitting IN_PROGRESS for hours with the room open and billing. But the page
   * going away is exactly what a killed WebView, a dead battery and a swiped-
   * away app all look like, and ending the class there is the opposite of what
   * a teacher wants — they reopen the app to find the lesson over and every
   * student thrown out.
   *
   * The abandoned-room case is now LiveKit's own job: the room is created with
   * `emptyTimeout` (see /api/sessions/[id]/join), so once the last person is
   * gone it closes itself and the `room_finished` webhook closes out the
   * attendance rows. `/api/admin/livekit-rooms` is the manual backstop.
   */

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
    <RoomErrorBoundary onLeave={onLeave}>
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
          choices.videoEnabled
            ? {
                resolution: VideoPresets.h720.resolution,
                ...(choices.videoDeviceId ? { deviceId: choices.videoDeviceId } : {}),
              }
            : false
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
          isHost={isHost}
          // Armed by the leave sheet immediately before it disconnects, so
          // handleDisconnected above can tell "end the class" from "I'm going".
          onEndClassIntent={() => {
            endOnDisconnectRef.current = true;
          }}
          sessionId={sessionId}
          teacherIdentity={teacherIdentity}
          teacherName={teacherName}
          joinCode={joinCode}
          sessionTitle={sessionTitle}
          initialEffect={choices.backgroundEffect}
        />
      </LKRoom>
    </RoomErrorBoundary>
  );
}

class RoomErrorBoundary extends React.Component<
  { children: React.ReactNode; onLeave?: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onLeave?: () => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn('RoomErrorBoundary caught unmount/teardown exception:', error, errorInfo);
    try {
      if (this.props.onLeave) {
        this.props.onLeave();
      } else if (typeof window !== 'undefined') {
        window.location.href = '/dashboard';
      }
    } catch {
      // Fallback
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white font-sans p-6 text-center">
          <p className="text-base font-semibold mb-3 text-slate-200">Leaving class…</p>
          <a
            href="/dashboard"
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-semibold text-white transition-colors"
          >
            Back to Dashboard
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
