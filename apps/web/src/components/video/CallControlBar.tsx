'use client';

/**
 * Call control bar — Canonical 9-position dock placement:
 *
 * Desktop & Tablet (>= 768px):
 * 1. Mute with device caret
 * 2. Video with device caret
 * 3. Participants with count
 * 4. Chat with unread badge
 * 5. Reactions (popover burst + persistent Hand Raise)
 * 6. Share (green active state)
 * 7. Host Tools (host only)
 * 8. More (overflow grid)
 * 9. End (rightmost red)
 *
 * Mobile & Compact (< 768px):
 * Dock: Mute, Video, Share, More, End.
 * More sheet contains all collaboration, host tools, and secondary tools in grouped grid.
 */

import React, { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import { useRoomContext, useTrackToggle } from '@livekit/components-react';
import { useCycleCamera, useHasMultipleCameras } from './cameraDevices';
import {
  getNativeSharing,
  isNativeShell,
  sessionIdFromRoom,
  startNativeScreenShare,
  stopNativeScreenShare,
  subscribeNativeSharing,
} from './nativeScreenShare';
import {
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  ChevronUpIcon,
  ClosedCaptionsIcon,
  FlipCameraIcon,
  HandRaiseIcon,
  HostShieldIcon,
  BreakoutIcon,
  InfoIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  SettingsIcon,
  SparklesIcon,
  VideoSlashIcon,
  WhiteboardIcon,
  ZoomShareBadgeIcon,
  ZoomEndHexagonIcon,
  ZoomSecurityShieldIcon,
  ZoomMoreIcon,
  ZoomHeartReactIcon,
} from './CallIcons';
import CallSettingsModal, { type SettingsTab } from './CallSettingsModal';
import HostToolsModal from './HostToolsModal';
import BreakoutPanel from './BreakoutPanel';

export type ViewMode = 'speaker' | 'gallery' | 'active';

export const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'speaker', label: 'Speaker View', hint: 'Spotlighted participant fills the stage' },
  { id: 'gallery', label: 'Gallery Grid', hint: 'All participants in an equal balanced grid' },
  { id: 'active', label: 'Active Speaker', hint: 'Dynamically tracks whoever is speaking' },
];

const EMOJI_REACTIONS = ['👍', '👏', '❤️', '🎉', '😂', '🤲'];

export default function CallControlBar({
  isHost,
  onEndClassIntent,
  unreadMessages,
  chatOpen,
  peopleOpen,
  onToggleChat,
  onTogglePeople,
  viewMode,
  onViewModeChange,
  onToggleEffects,
  isBackgroundBlurred = false,
  onToggleBackgroundBlur,
  onToggleMeetingInfo,
  onToggleCaptions,
  captionsActive = false,
  onToggleWhiteboard,
  whiteboardActive = false,
  sessionIdProp,
  onToggleBreakout,
  breakoutOpen = false,
  participantsCount = 1,
  onHandRaiseChange,
  onReaction,
}: {
  isHost: boolean;
  onEndClassIntent: () => void;
  unreadMessages: number;
  chatOpen: boolean;
  peopleOpen: boolean;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onToggleEffects?: () => void;
  isBackgroundBlurred?: boolean;
  onToggleBackgroundBlur?: () => void;
  onToggleMeetingInfo?: () => void;
  onToggleCaptions?: () => void;
  captionsActive?: boolean;
  onToggleWhiteboard?: () => void;
  whiteboardActive?: boolean;
  sessionIdProp?: string;
  onToggleBreakout?: () => void;
  breakoutOpen?: boolean;
  participantsCount?: number;
  onHandRaiseChange?: (raised: boolean) => void;
  onReaction?: (emoji: string) => void;
}) {
  const room = useRoomContext();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('general');
  const [audioNoiseMode, setAudioNoiseMode] = useState<'noise-removal' | 'isolation' | 'original'>('noise-removal');
  const [autoFrameEnabled, setAutoFrameEnabled] = useState(false);
  const [hostToolsOpen, setHostToolsOpen] = useState(false);
  const [breakoutFallbackOpen, setBreakoutFallbackOpen] = useState(false);
  const breakoutOpenEffective = onToggleBreakout ? breakoutOpen : breakoutFallbackOpen;
  const toggleBreakout = onToggleBreakout ?? (() => setBreakoutFallbackOpen((v) => !v));
  const breakoutSessionId = sessionIdProp ?? '';
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [micMenuOpen, setMicMenuOpen] = useState(false);
  const [camMenuOpen, setCamMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [stopIncomingVideo, setStopIncomingVideo] = useState(false);
  const stoppedVideoSubsRef = React.useRef<Map<string, boolean>>(new Map());
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string>();
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();

  const [nativePending, setNativePending] = useState(false);
  const [nativeSharing, setNativeSharingState] = useState(false);

  const nativeShell = isNativeShell();
  const sessionId = sessionIdFromRoom(room.name);

  useEffect(() => {
    if (!nativeShell) return;
    setNativeSharingState(getNativeSharing());
    return subscribeNativeSharing((active) => setNativeSharingState(active));
  }, [nativeShell]);

  const refreshDevices = async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === 'videoinput'));
      setMics(all.filter((d) => d.kind === 'audioinput'));
      setSpeakers(all.filter((d) => d.kind === 'audiooutput'));
      setDeviceError(null);
    } catch {
      setDeviceError('Could not list devices. Check browser permissions and try again.');
    }
  };

  useEffect(() => {
    refreshDevices();
    let handler: (() => void) | undefined;
    try {
      handler = () => refreshDevices();
      navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    } catch {}
    return () => {
      try {
        if (handler) navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
      } catch {}
    };
  }, []);

  const [micError, setMicError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handleSelectAudioMode = async (mode: 'noise-removal' | 'isolation' | 'original') => {
    setAudioNoiseMode(mode);
    try {
      const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      const mediaTrack = (pub?.track as unknown as { mediaStreamTrack?: MediaStreamTrack })?.mediaStreamTrack;
      if (mediaTrack && mediaTrack.applyConstraints) {
        if (mode === 'original') {
          await mediaTrack.applyConstraints({
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          });
        } else {
          await mediaTrack.applyConstraints({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          });
        }
      }
    } catch (err) {
      console.warn('Could not apply audio constraints:', err);
    }
  };

  const handleMicToggle = async () => {
    setMicError(null);
    try {
      await mic.toggle();
    } catch (e) {
      const name = (e as Error)?.name;
      setMicError(
        name === 'NotAllowedError'
          ? 'Microphone blocked. Allow access in the browser address bar, then try again.'
          : name === 'OverconstrainedError' || name === 'NotFoundError'
            ? 'No usable microphone was found. Connect one and use the device menu to pick it.'
            : 'Could not toggle the microphone. Try again.'
      );
    }
  };

  const handleCameraToggle = async () => {
    setCameraError(null);
    try {
      await camera.toggle();
    } catch (e) {
      const name = (e as Error)?.name;
      setCameraError(
        name === 'NotAllowedError'
          ? 'Camera blocked. Allow access in the browser address bar, then try again.'
          : name === 'OverconstrainedError' || name === 'NotFoundError'
            ? 'No usable camera was found. Connect one and use the device menu to pick it.'
            : 'Could not toggle the camera. Try again.'
      );
    }
  };

  const toggleNativeShare = async () => {
    if (!sessionId || nativePending) return;
    setNativePending(true);
    try {
      if (nativeSharing) {
        await stopNativeScreenShare();
        setNativeSharingState(false);
      } else {
        await startNativeScreenShare(sessionId);
        setNativeSharingState(true);
      }
    } catch (e) {
      console.error('Failed to toggle native screen share', e);
    } finally {
      setNativePending(false);
    }
  };

  const isModerator = room.localParticipant.permissions?.canPublishData ?? false;
  const isAppShell = typeof window !== 'undefined' && (/NoviceTutorApp/.test(navigator.userAgent) || typeof window.flutter_inappwebview !== 'undefined');
  const hasBrowserDisplayMedia = typeof navigator !== 'undefined' && typeof navigator.mediaDevices !== 'undefined' && !!navigator.mediaDevices.getDisplayMedia;
  const [allowParticipantShare, setAllowParticipantShare] = useState<boolean>(true);
  const [roomLocked, setRoomLocked] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    const applyMetadata = (raw?: string) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (!cancelled && typeof parsed.allowParticipantShare === 'boolean') {
          setAllowParticipantShare(parsed.allowParticipantShare);
        }
        if (!cancelled && typeof parsed.isLocked === 'boolean') {
          setRoomLocked(parsed.isLocked);
        }
      } catch {}
    };
    applyMetadata(room.metadata);
    const handler = () => {
      applyMetadata(room.metadata);
    };
    try {
      (room as unknown as { on: (e: string, h: () => void) => void }).on('RoomMetadataChanged', handler);
    } catch {}
    return () => {
      cancelled = true;
      try {
        (room as unknown as { off: (e: string, h: () => void) => void }).off('RoomMetadataChanged', handler);
      } catch {}
    };
  }, [room]);
  const sharePolicyAllows = isHost || allowParticipantShare !== false;
  const canScreenShare = (isModerator || isHost) && sharePolicyAllows && (nativeShell || (!isAppShell && hasBrowserDisplayMedia));
  const isSharing = nativeShell ? nativeSharing : screenShare.enabled;

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    onHandRaiseChange?.(next);
    try {
      const payload = new TextEncoder().encode(
        JSON.stringify({ type: 'hand_raise', raised: next, senderIdentity: room.localParticipant.identity })
      );
      room.localParticipant.publishData(payload, { reliable: true, topic: 'hand_raise' }).catch(() => {});
    } catch {}
  };

  const sendReaction = (emoji: string) => {
    onReaction?.(emoji);
    try {
      const payload = new TextEncoder().encode(
        JSON.stringify({
          emoji,
          senderIdentity: room.localParticipant.identity,
          senderName: room.localParticipant.name || 'Student',
          timestamp: Date.now(),
        })
      );
      room.localParticipant.publishData(payload, { reliable: true, topic: 'reaction' }).catch(() => {});
    } catch {}
    setReactionsOpen(false);
  };

  const toggleStopIncomingVideo = () => {
    const next = !stopIncomingVideo;
    setStopIncomingVideo(next);
    try {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.videoTrackPublications.values()) {
          const remote = pub as unknown as {
            setSubscribed?: (v: boolean) => void;
            isSubscribed?: boolean;
          };
          if (next) {
            stoppedVideoSubsRef.current.set(pub.trackSid, remote.isSubscribed ?? true);
            remote.setSubscribed?.(false);
          } else {
            const wasOn = stoppedVideoSubsRef.current.get(pub.trackSid);
            if (wasOn !== false) remote.setSubscribed?.(true);
          }
        }
      }
      if (!next) stoppedVideoSubsRef.current.clear();
    } catch {}
  };

  const handleExecuteEnd = async (endForAll: boolean) => {
    setEndConfirmOpen(false);
    if (ending) return;
    setEnding(true);
    setEndError(null);
    try {
      if (endForAll && isHost) {
        onEndClassIntent();
        try {
          await fetch(`/api/sessions/${sessionId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
        } catch {
          setEndError('Could not end the class on the server. You have left the room; the class may still show as live.');
        }
      }
      await room.disconnect();
    } catch (err) {
      console.warn('Disconnect error:', err);
      if (typeof window !== 'undefined') {
        window.location.href = '/dashboard';
      }
    } finally {
      setEnding(false);
    }
  };

  return (
    <>
      {/* CANONICAL BOTTOM DOCK */}
      <div
        className="fixed inset-x-0 bottom-2 sm:bottom-4 z-40 flex justify-center px-2 sm:px-4 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="call-control-bar pointer-events-auto flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-[28px] shadow-2xl transition-all"
          style={{
            background: 'rgba(18, 20, 26, 0.82)',
            backdropFilter: 'blur(36px) saturate(200%)',
            WebkitBackdropFilter: 'blur(36px) saturate(200%)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            boxShadow: '0 20px 48px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
          }}
        >
          {/* Position 1: Audio with device caret */}
          <div className="relative flex flex-col items-center">
            <div className="flex items-center rounded-2xl overflow-hidden bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition">
              <button
                type="button"
                onClick={handleMicToggle}
                disabled={mic.pending}
                title={mic.enabled ? 'Mute' : 'Unmute'}
                aria-label={mic.enabled ? 'Mute' : 'Unmute'}
                className="h-10 px-2.5 flex items-center justify-center cursor-pointer transition active:scale-95 disabled:opacity-50"
                style={{ color: mic.enabled ? '#ffffff' : '#FF453A' }}
              >
                {mic.enabled ? <MicIcon className="w-5 h-5" /> : <MicOffIcon className="w-5 h-5 text-red-500" />}
              </button>
              <button
                type="button"
                onClick={() => setMicMenuOpen((v) => !v)}
                title="Microphone settings"
                aria-label="Microphone settings"
                className="h-10 px-1.5 flex items-center justify-center text-white/70 hover:text-white border-l border-white/10 hover:bg-white/10 transition cursor-pointer"
              >
                <ChevronUpIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-white/80 font-medium mt-1 select-none">
              {mic.enabled ? 'Mute' : 'Unmute'}
            </span>
            {micError && (
              <span role="alert" className="mt-1 max-w-[160px] text-center text-[10px] font-semibold text-amber-300">
                {micError}{' '}
                <button type="button" onClick={refreshDevices} className="underline cursor-pointer">Retry</button>
              </span>
            )}

            {/* Mic device dropdown */}
            {micMenuOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setMicMenuOpen(false)} />
                <div
                  className="absolute bottom-16 left-0 z-50 w-72 p-2.5 rounded-2xl shadow-2xl border border-white/20 text-xs animate-fadeIn text-white space-y-2 select-none"
                  style={{
                    background: 'rgba(26, 30, 38, 0.96)',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  }}
                >
                  {/* Select Microphone */}
                  <div>
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider px-2 py-1">
                      Select a Microphone
                    </div>
                    {deviceError && (
                      <div role="alert" className="px-2 text-[11px] text-amber-300">
                        {deviceError}{' '}
                        <button type="button" onClick={refreshDevices} className="underline cursor-pointer">Retry</button>
                      </div>
                    )}
                    {mics.length === 0 && !deviceError && (
                      <div className="px-2 text-[11px] text-white/60">
                        No microphones found.{' '}
                        <button type="button" onClick={refreshDevices} className="underline cursor-pointer">Retry</button>
                      </div>
                    )}
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {mics.map((m) => {
                        const active = room.getActiveDevice('audioinput') === m.deviceId;
                        return (
                          <button
                            key={m.deviceId}
                            type="button"
                            onClick={() => {
                              room.switchActiveDevice('audioinput', m.deviceId).catch(() => {});
                              setMicMenuOpen(false);
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition cursor-pointer text-white/90"
                          >
                            <span className="w-3.5 text-[#0A84FF] font-bold text-sm">{active ? '✓' : ''}</span>
                            <span className="truncate">{m.label || `Microphone ${m.deviceId.slice(0, 5)}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-1" />

                  {/* Select Speaker */}
                  <div>
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider px-2 py-1">
                      Select a Speaker
                    </div>
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {speakers.map((s) => {
                        const active = (audioOutputDeviceId || speakers[0]?.deviceId) === s.deviceId;
                        return (
                          <button
                            key={s.deviceId}
                            type="button"
                            onClick={() => {
                              setAudioOutputDeviceId?.(s.deviceId);
                              room.switchActiveDevice('audiooutput', s.deviceId).catch(() => {});
                              setMicMenuOpen(false);
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition cursor-pointer text-white/90"
                          >
                            <span className="w-3.5 text-[#0A84FF] font-bold text-sm">{active ? '✓' : ''}</span>
                            <span className="truncate">{s.label || `Speaker ${s.deviceId.slice(0, 5)}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-1" />

                  {/* Microphone Modes */}
                  <div>
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider px-2 py-1">
                      Microphone Modes
                    </div>
                    <div className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => handleSelectAudioMode('noise-removal')}
                        className="w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition cursor-pointer text-white/90"
                      >
                        <span className="w-3.5 text-[#0A84FF] font-bold text-sm">{audioNoiseMode === 'noise-removal' ? '✓' : ''}</span>
                        <span className="truncate">Noise removal (default)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAudioMode('isolation')}
                        className="w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition cursor-pointer text-white/90"
                      >
                        <span className="w-3.5 text-[#0A84FF] font-bold text-sm">{audioNoiseMode === 'isolation' ? '✓' : ''}</span>
                        <span className="truncate">Personalized audio isolation</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAudioMode('original')}
                        className="w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition cursor-pointer text-white/90"
                      >
                        <span className="w-3.5 text-[#0A84FF] font-bold text-sm">{audioNoiseMode === 'original' ? '✓' : ''}</span>
                        <span className="truncate">Original sound for musicians</span>
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-1" />

                  {/* Audio Utilities */}
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMicMenuOpen(false);
                        setSettingsInitialTab('audio');
                        setSettingsOpen(true);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-xl text-xs hover:bg-white/10 transition cursor-pointer text-white/90 pl-6"
                    >
                      Test Speaker & Microphone...
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMicMenuOpen(false);
                        setSettingsInitialTab('audio');
                        setSettingsOpen(true);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-xl text-xs hover:bg-white/10 transition cursor-pointer text-white/90 pl-6"
                    >
                      Audio Settings...
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Position 2: Video with device caret */}
          <div className="relative flex flex-col items-center">
            <div className="flex items-center rounded-2xl overflow-hidden bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition">
              <button
                type="button"
                onClick={handleCameraToggle}
                disabled={camera.pending}
                title={camera.enabled ? 'Stop Video' : 'Start Video'}
                aria-label={camera.enabled ? 'Stop Video' : 'Start Video'}
                className="h-10 px-2.5 flex items-center justify-center cursor-pointer transition active:scale-95 disabled:opacity-50"
                style={{ color: camera.enabled ? '#ffffff' : '#FF453A' }}
              >
                {camera.enabled ? <CameraIcon className="w-5 h-5" /> : <CameraOffIcon className="w-5 h-5 text-red-500" />}
              </button>
              <button
                type="button"
                onClick={() => setCamMenuOpen((v) => !v)}
                title="Camera settings"
                aria-label="Camera settings"
                className="h-10 px-1.5 flex items-center justify-center text-white/70 hover:text-white border-l border-white/10 hover:bg-white/10 transition cursor-pointer"
              >
                <ChevronUpIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-white/80 font-medium mt-1 select-none">
              {camera.enabled ? 'Stop Video' : 'Start Video'}
            </span>
            {cameraError && (
              <span role="alert" className="mt-1 max-w-[160px] text-center text-[10px] font-semibold text-amber-300">
                {cameraError}{' '}
                <button type="button" onClick={refreshDevices} className="underline cursor-pointer">Retry</button>
              </span>
            )}

            {/* Camera device dropdown */}
            {camMenuOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setCamMenuOpen(false)} />
                <div
                  className="absolute bottom-16 left-0 z-50 w-72 p-2.5 rounded-2xl shadow-2xl border border-white/20 text-xs animate-fadeIn text-white space-y-2 select-none"
                  style={{
                    background: 'rgba(26, 30, 38, 0.96)',
                    backdropFilter: 'blur(32px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(180%)',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                  }}
                >
                  {/* Select Camera */}
                  <div>
                    <div className="text-[10px] font-bold text-white/50 uppercase tracking-wider px-2 py-1">
                      Select a Camera
                    </div>
                    {deviceError && (
                      <div role="alert" className="px-2 text-[11px] text-amber-300">
                        {deviceError}{' '}
                        <button type="button" onClick={refreshDevices} className="underline cursor-pointer">Retry</button>
                      </div>
                    )}
                    {cameras.length === 0 && !deviceError && (
                      <div className="px-2 text-[11px] text-white/60">
                        No cameras found.{' '}
                        <button type="button" onClick={refreshDevices} className="underline cursor-pointer">Retry</button>
                      </div>
                    )}
                    <div className="space-y-0.5 max-h-32 overflow-y-auto">
                      {cameras.map((c) => {
                        const active = room.getActiveDevice('videoinput') === c.deviceId;
                        return (
                          <button
                            key={c.deviceId}
                            type="button"
                            onClick={() => {
                              room.switchActiveDevice('videoinput', c.deviceId).catch(() => {});
                              setCamMenuOpen(false);
                            }}
                            className="w-full text-left px-2 py-1.5 rounded-xl text-xs flex items-center gap-2 hover:bg-white/10 transition cursor-pointer text-white/90"
                          >
                            <span className="w-3.5 text-[#0A84FF] font-bold text-sm">{active ? '✓' : ''}</span>
                            <span className="truncate">{c.label || `Camera ${c.deviceId.slice(0, 5)}`}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-1" />

                  {/* Blur My Background & Auto-frame */}
                  <div className="space-y-2 px-2 py-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/90">Blur My Background</span>
                      <button
                        type="button"
                        onClick={() => onToggleBackgroundBlur?.()}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                          isBackgroundBlurred ? 'bg-[#0A84FF] justify-end' : 'bg-white/20 justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/90">Auto-frame</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (hasMultipleCameras) cycleCamera();
                          setAutoFrameEnabled((v) => !v);
                        }}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer flex items-center ${
                          autoFrameEnabled ? 'bg-[#0A84FF] justify-end' : 'bg-white/20 justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-white/10 my-1" />

                  {/* Virtual Background & Settings */}
                  <div className="space-y-0.5">
                    {onToggleEffects && (
                      <button
                        type="button"
                        onClick={() => {
                          setCamMenuOpen(false);
                          onToggleEffects();
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-xl text-xs hover:bg-white/10 transition cursor-pointer text-white/90 pl-6"
                      >
                        Choose Virtual Background...
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCamMenuOpen(false);
                        setSettingsInitialTab('video');
                        setSettingsOpen(true);
                      }}
                      className="w-full text-left px-2 py-1.5 rounded-xl text-xs hover:bg-white/10 transition cursor-pointer text-white/90 pl-6"
                    >
                      Video & Effects Settings...
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Position 3: Participants with count (Desktop only) */}
          <div className="hidden md:flex flex-col items-center">
            <div className={`flex items-center rounded-2xl overflow-hidden border transition ${
              peopleOpen ? 'bg-white/[0.2] border-sky-400/40 shadow-sm' : 'bg-white/[0.08] hover:bg-white/[0.14] border-white/10'
            }`}>
              <button
                type="button"
                onClick={onTogglePeople}
                title="Participants"
                aria-label="Participants"
                className="h-10 px-2.5 flex items-center justify-center gap-1 cursor-pointer transition active:scale-95 text-white"
              >
                <PeopleIcon className="w-5 h-5" />
                <span className="text-xs font-semibold">{participantsCount}</span>
              </button>
              <button
                type="button"
                onClick={onTogglePeople}
                title="Participants options"
                aria-label="Participants options"
                className="h-10 px-1.5 flex items-center justify-center text-white/70 hover:text-white border-l border-white/10 hover:bg-white/10 transition cursor-pointer"
              >
                <ChevronUpIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-white/80 font-medium mt-1 select-none">Participants</span>
          </div>

          {/* Position 4: Chat with unread badge (Desktop only) */}
          <div className="hidden md:flex flex-col items-center">
            <div className="relative flex items-center rounded-2xl overflow-hidden bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition">
              <button
                type="button"
                onClick={onToggleChat}
                title="Chat"
                aria-label="Chat"
                className="h-10 px-2.5 flex items-center justify-center cursor-pointer transition active:scale-95 text-white"
              >
                <ChatIcon className="w-5 h-5" />
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-red-500 text-white shadow-md border border-white/20">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={onToggleChat}
                title="Chat options"
                aria-label="Chat options"
                className="h-10 px-1.5 flex items-center justify-center text-white/70 hover:text-white border-l border-white/10 hover:bg-white/10 transition cursor-pointer"
              >
                <ChevronUpIcon className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-white/80 font-medium mt-1 select-none">Chat</span>
          </div>

          {/* Position 5: Reactions (Desktop only) */}
          <div className="relative hidden md:flex flex-col items-center">
            <button
              type="button"
              onClick={() => setReactionsOpen((v) => !v)}
              title="Reactions & Hand Raise"
              aria-label="Reactions"
              className="h-10 px-3.5 rounded-2xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 cursor-pointer transition active:scale-95 text-white"
            >
              {handRaised ? <HandRaiseIcon className="w-5 h-5 text-yellow-400" /> : <ZoomHeartReactIcon className="w-5 h-5" />}
            </button>
            <span className="text-[10px] text-white/80 font-medium mt-1 select-none">
              {handRaised ? 'Raised' : 'React'}
            </span>

            {/* Reactions Popover */}
            {reactionsOpen && (
              <>
                <div className="fixed inset-0 z-50" onClick={() => setReactionsOpen(false)} />
                <div
                  className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 p-2.5 rounded-2xl shadow-2xl border border-white/20 flex flex-col gap-2 animate-fadeIn"
                  style={{ background: 'rgba(28, 30, 36, 0.98)', backdropFilter: 'blur(24px)' }}
                >
                  <div className="flex items-center gap-1.5">
                    {EMOJI_REACTIONS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => sendReaction(em)}
                        className="w-9 h-9 rounded-xl hover:bg-white/15 flex items-center justify-center text-lg transition cursor-pointer active:scale-125"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={toggleHandRaise}
                    className="w-full py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    style={{
                      background: handRaised ? 'rgba(234, 179, 8, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                      color: handRaised ? '#fde047' : '#ffffff',
                    }}
                  >
                    <HandRaiseIcon className="w-4 h-4" />
                    <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Position 6: Share (green active state) */}
          {canScreenShare && (
            <div className="relative flex flex-col items-center">
              <div className="flex items-center rounded-2xl overflow-hidden bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 transition">
                <button
                  type="button"
                  onClick={() => {
                    if (nativeShell) {
                      toggleNativeShare();
                    } else {
                      screenShare.toggle();
                    }
                  }}
                  title={isSharing ? 'Stop sharing screen' : 'Share your screen'}
                  aria-label={isSharing ? 'Stop sharing screen' : 'Share screen'}
                  className="h-10 px-2.5 flex items-center justify-center cursor-pointer transition active:scale-95"
                >
                  <ZoomShareBadgeIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShareMenuOpen((v) => !v)}
                  title="Share options"
                  aria-label="Share options"
                  className="h-10 px-1.5 flex items-center justify-center text-white/70 hover:text-white border-l border-white/10 hover:bg-white/10 transition cursor-pointer"
                >
                  <ChevronUpIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[10px] font-medium mt-1 select-none text-[#30D158]">
                {isSharing ? 'Stop Share' : 'Share'}
              </span>

              {/* Zoom Share Options Caret Menu */}
              {shareMenuOpen && (
                <>
                  <div className="fixed inset-0 z-50" onClick={() => setShareMenuOpen(false)} />
                  <div
                    className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 w-72 rounded-2xl p-2.5 shadow-2xl border flex flex-col gap-1 text-xs animate-fadeIn"
                    style={{
                      background: 'rgba(28, 29, 34, 0.96)',
                      backdropFilter: 'blur(36px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(36px) saturate(180%)',
                      borderColor: 'rgba(255, 255, 255, 0.16)',
                      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (isHost) setAllowParticipantShare(false);
                        setShareMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/10 transition cursor-pointer text-white"
                    >
                      <span className="truncate">One participant can share at a time</span>
                      {!allowParticipantShare && <span className="text-[#30D158] font-bold shrink-0 ml-2">✓</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isHost) setAllowParticipantShare(true);
                        setShareMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/10 transition cursor-pointer text-white"
                    >
                      <span className="truncate">Multiple participants can share</span>
                      {allowParticipantShare && <span className="text-[#30D158] font-bold shrink-0 ml-2">✓</span>}
                    </button>

                    {isHost && (
                      <>
                        <div className="h-[1px] bg-white/10 my-1" />
                        <button
                          type="button"
                          onClick={() => {
                            setShareMenuOpen(false);
                            setHostToolsOpen(true);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 transition text-sky-400 font-medium cursor-pointer"
                        >
                          Advanced Sharing Options…
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Position 7: Host Tools (host only, Desktop only) */}
          {isHost && (
            <div className="hidden md:flex flex-col items-center">
              <button
                type="button"
                onClick={() => setHostToolsOpen(true)}
                title="Host Management Tools"
                aria-label="Host Tools"
                className="h-10 px-3.5 rounded-2xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 cursor-pointer transition active:scale-95 text-white"
              >
                <ZoomSecurityShieldIcon className="w-5 h-5 text-emerald-400" />
              </button>
              <span className="text-[10px] text-white/80 font-medium mt-1 select-none">Host tools</span>
            </div>
          )}

          {/* Position 8: More */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              title="More options"
              aria-label="More options"
              className="relative h-10 px-3.5 rounded-2xl flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 cursor-pointer transition active:scale-95 text-white"
            >
              <ZoomMoreIcon className="w-5 h-5" />
              <span className="md:hidden">
                {unreadMessages > 0 && !chatOpen && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-red-500 text-white shadow-md border border-white/20">
                    {unreadMessages > 9 ? '9+' : unreadMessages}
                  </span>
                )}
              </span>
            </button>
            <span className="text-[10px] text-white/80 font-medium mt-1 select-none">More</span>
          </div>

          {/* Position 9: End */}
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => {
                if (ending) return;
                if (isHost) {
                  setEndConfirmOpen(true);
                } else {
                  handleExecuteEnd(false);
                }
              }}
              disabled={ending}
              title={isHost ? 'End or leave class' : 'Leave call'}
              aria-label={isHost ? 'End or leave class' : 'Leave call'}
              className="h-10 px-4 rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shrink-0 shadow-lg hover:brightness-110 bg-[#FF453A] hover:bg-red-600 text-white font-bold text-xs"
              style={{
                boxShadow: '0 4px 14px rgba(255, 69, 58, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
              }}
            >
              <ZoomEndHexagonIcon className="w-4 h-4" />
              <span>{isHost ? 'End' : 'Leave'}</span>
            </button>
            <span className="text-[10px] text-red-400 font-bold mt-1 select-none opacity-0">.</span>
            {endError && (
              <span role="alert" className="mt-1 max-w-[180px] text-center text-[10px] font-semibold text-amber-300">
                {endError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* MORE OVERFLOW BOTTOM SHEET / GRID */}
      {moreMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setMoreMenuOpen(false)}
          />
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-6 z-[71] w-full sm:max-w-lg rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-y-auto max-h-[80vh]"
            style={{
              background: 'rgba(24, 26, 32, 0.96)',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3 sm:hidden" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <h3 className="text-sm font-bold text-white tracking-tight">Classroom Controls</h3>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Mobile-Only Section: Host Tools (Grouped first for Host) */}
              {isHost && (
                <div className="md:hidden p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <HostShieldIcon className="w-5 h-5 text-emerald-400" />
                      <div>
                        <div className="text-xs font-bold text-white">Host Tools</div>
                        <div className="text-[11px] text-white/50">Mute all, lock room, permissions</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setHostToolsOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white cursor-pointer"
                    >
                      Open
                    </button>
                  </div>
                </div>
              )}

              {/* Mobile-Only Section: Collaboration (Participants, Chat, Reactions) */}
              <div className="md:hidden grid grid-cols-3 gap-2 pb-2 border-b border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onTogglePeople();
                  }}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 flex flex-col items-center gap-1.5 text-center cursor-pointer transition"
                >
                  <PeopleIcon className="w-5 h-5 text-blue-400" />
                  <span className="text-[11px] font-bold text-white">People ({participantsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onToggleChat();
                  }}
                  className="relative p-3 rounded-2xl bg-white/5 hover:bg-white/10 flex flex-col items-center gap-1.5 text-center cursor-pointer transition"
                >
                  <ChatIcon className="w-5 h-5 text-blue-400" />
                  <span className="text-[11px] font-bold text-white">Chat</span>
                  {unreadMessages > 0 && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-red-500 text-white">
                      {unreadMessages}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleHandRaise();
                  }}
                  className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 flex flex-col items-center gap-1.5 text-center cursor-pointer transition"
                >
                  <HandRaiseIcon className={`w-5 h-5 ${handRaised ? 'text-yellow-400' : 'text-white/80'}`} />
                  <span className="text-[11px] font-bold text-white">
                    {handRaised ? 'Lower Hand' : 'Raise Hand'}
                  </span>
                </button>
              </div>

              {/* General In-Call Grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* 1. Whiteboard */}
                {onToggleWhiteboard && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onToggleWhiteboard();
                    }}
                    className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                      whiteboardActive
                        ? 'bg-blue-600/20 border-blue-500/80 text-white'
                        : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <WhiteboardIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Whiteboard</div>
                      <div className="text-[10px] text-white/50">
                        {whiteboardActive ? 'Hide Board' : 'Draw & Teach'}
                      </div>
                    </div>
                  </button>
                )}

                {/* 2. Breakout Rooms */}
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    toggleBreakout();
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                    breakoutOpenEffective
                      ? 'bg-amber-600/20 border-amber-500/80 text-white'
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <BreakoutIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Breakout Rooms</div>
                    <div className="text-[10px] text-white/50">
                      {breakoutOpenEffective ? 'Manage Groups' : 'Split & Group'}
                    </div>
                  </div>
                </button>

                {/* 3. Captions */}
                <button
                  type="button"
                  onClick={() => {
                    onToggleCaptions?.();
                  }}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                    captionsActive
                      ? 'bg-emerald-600/20 border-emerald-500/80 text-white'
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <ClosedCaptionsIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Captions</div>
                    <div className="text-[10px] text-white/50">
                      {captionsActive ? 'Enabled' : 'Live Transcription'}
                    </div>
                  </div>
                </button>

                {/* 4. Visual Effects / Backgrounds */}
                {onToggleEffects && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onToggleEffects();
                    }}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left transition cursor-pointer flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                      <SparklesIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Backgrounds</div>
                      <div className="text-[10px] text-white/50">Blur & Masjid views</div>
                    </div>
                  </button>
                )}

                {/* 5. Stop Incoming Video (Bandwidth saver) */}
                <button
                  type="button"
                  onClick={toggleStopIncomingVideo}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer flex items-center gap-3 ${
                    stopIncomingVideo
                      ? 'bg-amber-600/20 border-amber-500/80 text-white'
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                    <VideoSlashIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Incoming Video</div>
                    <div className="text-[10px] text-white/50">
                      {stopIncomingVideo ? 'Paused (Audio only)' : 'Pause Video'}
                    </div>
                  </div>
                </button>

                {/* 6. Flip Camera (mobile) */}
                {hasMultipleCameras && (
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      cycleCamera();
                    }}
                    className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left transition cursor-pointer flex items-center gap-3"
                  >
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                      <FlipCameraIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Flip Camera</div>
                      <div className="text-[10px] text-white/50">Front / Rear view</div>
                    </div>
                  </button>
                )}

                {/* 7. Settings */}
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    setSettingsOpen(true);
                  }}
                  className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left transition cursor-pointer flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                    <SettingsIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Settings</div>
                    <div className="text-[10px] text-white/50">Audio, video, stats</div>
                  </div>
                </button>
              </div>

              {/* Meeting Info Shortcut */}
              {onToggleMeetingInfo && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onToggleMeetingInfo();
                  }}
                  className="w-full p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left transition cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <InfoIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Meeting Info & Invite Link</div>
                      <div className="text-[10px] text-white/50">View numeric join code & copy link</div>
                    </div>
                  </div>
                  <span className="text-xs text-white/40 font-bold">→</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* END / LEAVE CONFIRMATION DIALOG FOR HOST */}
      {endConfirmOpen && (
        <>
          <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={() => setEndConfirmOpen(false)} />
          <div
            className="fixed left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 z-[91] w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-fadeIn"
            style={{
              background: 'rgba(28, 30, 36, 0.96)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
            }}
          >
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
              <LeaveIcon className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">End or Leave Class?</h3>
              <p className="text-xs text-white/60 mt-1">
                You are the assigned teacher for this session.
              </p>
            </div>
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleExecuteEnd(true)}
                disabled={ending}
                className="w-full py-2.5 rounded-2xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white cursor-pointer transition active:scale-95 shadow-lg disabled:opacity-50"
              >
                {ending ? 'Ending…' : 'End Class for Everyone'}
              </button>
              <button
                type="button"
                onClick={() => handleExecuteEnd(false)}
                disabled={ending}
                className="w-full py-2.5 rounded-2xl text-xs font-bold bg-white/10 hover:bg-white/15 text-white cursor-pointer transition disabled:opacity-50"
              >
                {ending ? 'Leaving…' : 'Leave Class (Keep Running)'}
              </button>
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                className="w-full py-2 text-xs text-white/50 hover:text-white cursor-pointer transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* SETTINGS DIALOG */}
      {settingsOpen && (
        <CallSettingsModal
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsInitialTab}
          viewMode={viewMode}
          onViewModeChange={onViewModeChange}
          onToggleEffects={onToggleEffects}
          cameras={cameras}
          mics={mics}
          speakers={speakers}
          audioOutputDeviceId={audioOutputDeviceId}
          onSelectSpeaker={setAudioOutputDeviceId}
        />
      )}

      {/* BREAKOUT ROOMS PANEL */}
      {breakoutOpenEffective && (
        <BreakoutPanel
          sessionId={breakoutSessionId || sessionId || ''}
          isHost={isHost}
          onClose={() => {
            if (onToggleBreakout) onToggleBreakout();
            else setBreakoutFallbackOpen(false);
          }}
        />
      )}

      {/* HOST TOOLS MODAL */}
      {hostToolsOpen && (
        <HostToolsModal
          sessionId={sessionId || ''}
          isLocked={roomLocked}
          allowParticipantShare={allowParticipantShare}
          onLockChange={(locked) => setRoomLocked(locked)}
          onSharePolicyChange={(allowed) => setAllowParticipantShare(allowed)}
          onEndClassIntent={onEndClassIntent}
          onClose={() => setHostToolsOpen(false)}
          onOpenGuests={onTogglePeople}
        />
      )}
    </>
  );
}
