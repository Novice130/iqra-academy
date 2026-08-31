'use client';

/**
 * Call control bar — Google Meet Material You design language:
 * - Circular control buttons: Mic, Camera, Hand Raise (✋), More Options (⋮), and End Call (Red pill).
 * - Google Meet More Options Bottom Sheet:
 *   - In-call messages (Chat with badge)
 *   - Share screen (Present screen)
 *   - People / Participants (Roster & Student Ringing)
 *   - Visual effects (Background blur & virtual backgrounds)
 *   - Audio & Video Settings (Speaker routing, microphone & camera selector)
 *   - Host controls (for teacher)
 *   - Meeting details & copy link
 */

import { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import {
  useRoomContext,
  useTrackToggle,
} from '@livekit/components-react';
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
  FlipCameraIcon,
  HandRaiseIcon,
  InfoIcon,
  LayoutIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PeopleIcon,
  ScreenShareIcon,
  SettingsIcon,
  SparklesIcon,
  SpeakerIcon,
} from './CallIcons';

export type ViewMode = 'speaker' | 'gallery' | 'active';

export const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'speaker', label: 'Speaker View', hint: 'Spotlighted participant fills the stage' },
  { id: 'gallery', label: 'Gallery Grid', hint: 'All participants in an equal balanced grid' },
  { id: 'active', label: 'Active Speaker', hint: 'Dynamically tracks whoever is speaking' },
];

function SpeakerDeviceSelect({
  devices,
  value,
  onChange,
  onRefresh,
}: {
  devices: MediaDeviceInfo[];
  value: string | undefined;
  onChange: (id: string) => void;
  onRefresh: () => void;
}) {
  const hasOutputSelect =
    typeof navigator !== 'undefined' &&
    'selectAudioOutput' in (navigator.mediaDevices || {});

  const handleSelectOutput = async () => {
    try {
      if (hasOutputSelect) {
        const dev = await (navigator.mediaDevices as any).selectAudioOutput();
        if (dev?.deviceId) {
          onChange(dev.deviceId);
          onRefresh();
        }
      }
    } catch {}
  };

  return (
    <div className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">
        Speaker / Audio Output
      </span>
      {devices.length > 0 ? (
        <div className="space-y-2">
          <select
            value={value ?? devices[0]?.deviceId ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3.5 py-3 rounded-2xl text-xs font-medium cursor-pointer transition min-h-[44px]"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              color: '#f3f4f6',
              border: '1px solid rgba(255, 255, 255, 0.16)',
            }}
          >
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900 text-white">
                {d.label || `Speaker ${i + 1}`}
              </option>
            ))}
          </select>
          {hasOutputSelect && (
            <button
              type="button"
              onClick={handleSelectOutput}
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white/90 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <SpeakerIcon className="w-4 h-4 text-emerald-400" />
              <span>Choose Output Device…</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="p-3.5 rounded-2xl space-y-2"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <div className="flex items-center justify-between text-xs text-white">
            <span className="font-semibold flex items-center gap-1.5">
              <SpeakerIcon className="w-4 h-4 text-emerald-400" />
              <span>Default Speaker / Bluetooth</span>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
              Active
            </span>
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Audio automatically routes to your phone speaker, Bluetooth, or connected headphones.
          </p>
          {hasOutputSelect && (
            <button
              type="button"
              onClick={handleSelectOutput}
              className="w-full py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/15 text-white transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <SpeakerIcon className="w-4 h-4 text-emerald-400" />
              <span>Choose Speaker / Bluetooth…</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DeviceSelect({
  label,
  devices,
  value,
  onChange,
  disabled,
}: {
  label: string;
  devices: MediaDeviceInfo[];
  value: string | undefined;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  if (devices.length === 0) return null;
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1.5">{label}</span>
      <select
        value={value ?? devices[0]?.deviceId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3.5 py-3 rounded-2xl text-xs font-medium cursor-pointer disabled:opacity-50 transition min-h-[44px]"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          color: '#f3f4f6',
          border: '1px solid rgba(255, 255, 255, 0.16)',
        }}
      >
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId} className="bg-neutral-900 text-white">
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

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
  onToggleMeetingInfo,
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
  onToggleMeetingInfo?: () => void;
}) {
  const room = useRoomContext();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const camera = useTrackToggle({ source: Track.Source.Camera });
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string>();

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
    } catch {}
  };

  useEffect(() => {
    refreshDevices();
  }, []);

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
  const canScreenShare = isModerator;

  const toggleHandRaise = () => {
    const next = !handRaised;
    setHandRaised(next);
    // Publish data message for hand raise if available
    try {
      const payload = new TextEncoder().encode(JSON.stringify({ type: 'hand_raise', raised: next }));
      room.localParticipant.publishData(payload, { reliable: true, topic: 'hand_raise' }).catch(() => {});
    } catch {}
  };

  return (
    <>
      {/* Google Meet Bottom Control Bar */}
      <div
        className="fixed inset-x-0 bottom-2 sm:bottom-4 z-40 flex justify-center px-3 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="call-control-bar pointer-events-auto flex items-center justify-center gap-3 sm:gap-4 px-4 py-2.5 rounded-full shrink-0 shadow-2xl transition-all"
          style={{
            background: 'rgba(32, 28, 25, 0.92)',
            backdropFilter: 'blur(32px) saturate(180%)',
            WebkitBackdropFilter: 'blur(32px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          }}
        >
          {/* Button 1: Microphone (Red when muted, Dark Gray when on) */}
          <button
            type="button"
            onClick={() => mic.toggle()}
            disabled={mic.pending}
            title={mic.enabled ? 'Turn off microphone' : 'Turn on microphone'}
            aria-label={mic.enabled ? 'Turn off microphone' : 'Turn on microphone'}
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-50 shrink-0 shadow-md hover:brightness-110"
            style={{
              background: mic.enabled ? '#3c4043' : '#ea4335',
              color: '#ffffff',
              border: mic.enabled ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: mic.enabled ? 'none' : '0 4px 14px rgba(234, 67, 53, 0.4)',
            }}
          >
            {mic.enabled ? <MicIcon className="w-5 h-5" /> : <MicOffIcon className="w-5 h-5" />}
          </button>

          {/* Button 2: Camera (Red when off, Dark Gray when on) */}
          <button
            type="button"
            onClick={() => camera.toggle()}
            disabled={camera.pending}
            title={camera.enabled ? 'Turn off camera' : 'Turn on camera'}
            aria-label={camera.enabled ? 'Turn off camera' : 'Turn on camera'}
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 disabled:opacity-50 shrink-0 shadow-md hover:brightness-110"
            style={{
              background: camera.enabled ? '#3c4043' : '#ea4335',
              color: '#ffffff',
              border: camera.enabled ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: camera.enabled ? 'none' : '0 4px 14px rgba(234, 67, 53, 0.4)',
            }}
          >
            {camera.enabled ? <CameraIcon className="w-5 h-5" /> : <CameraOffIcon className="w-5 h-5" />}
          </button>

          {/* Button 3: Hand Raise (✋ Google Meet style) */}
          <button
            type="button"
            onClick={toggleHandRaise}
            title={handRaised ? 'Lower hand' : 'Raise hand'}
            aria-label={handRaised ? 'Lower hand' : 'Raise hand'}
            className="w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 shadow-md hover:brightness-110"
            style={{
              background: handRaised ? '#8ab4f8' : '#3c4043',
              color: handRaised ? '#1e293b' : '#ffffff',
              border: handRaised ? '1px solid rgba(138, 180, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: handRaised ? '0 4px 14px rgba(138, 180, 248, 0.45)' : 'none',
            }}
          >
            <HandRaiseIcon className="w-5 h-5" />
          </button>

          {/* Button 4: More Options (⋮ 3-dots) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              title="More options"
              aria-label="More options"
              className="relative w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 shadow-md hover:brightness-110"
              style={{
                background: moreMenuOpen ? '#4f5358' : '#3c4043',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <MoreIcon className="w-5 h-5" />
              {unreadMessages > 0 && !chatOpen && (
                <span
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center bg-blue-500 text-white shadow-md"
                >
                  {unreadMessages > 9 ? '9+' : unreadMessages}
                </span>
              )}
            </button>
          </div>

          {/* Button 5: End Call (Red Pill button matching Google Meet) */}
          <button
            type="button"
            onClick={async () => {
              try {
                if (isHost) {
                  onEndClassIntent();
                  try {
                    const payload = new TextEncoder().encode(
                      JSON.stringify({ type: 'CLASS_ENDED', sessionId })
                    );
                    room.localParticipant.publishData(payload, { reliable: true }).catch(() => {});
                  } catch {}
                  fetch(`/api/sessions/${sessionId}/end`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                  }).catch(() => {});
                }
                room.disconnect();
              } catch (err) {
                console.warn('Disconnect error caught:', err);
                if (typeof window !== 'undefined') {
                  window.location.href = '/dashboard';
                }
              }
            }}
            title={isHost ? 'End class for everyone' : 'Leave call'}
            aria-label={isHost ? 'End class for everyone' : 'Leave call'}
            className="w-14 sm:w-16 h-12 sm:h-13 rounded-full flex items-center justify-center cursor-pointer transition-all active:scale-95 shrink-0 shadow-lg hover:brightness-110"
            style={{
              background: '#ea4335',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: '0 6px 18px rgba(234, 67, 53, 0.5)',
            }}
          >
            <LeaveIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* GOOGLE MEET MORE OPTIONS BOTTOM SHEET */}
      {moreMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setMoreMenuOpen(false)}
          />
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-6 z-[71] w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-y-auto max-h-[78vh]"
            style={{
              background: 'rgba(32, 28, 25, 0.95)',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            }}
          >
            {/* Top Drag Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-2">
              <h3 className="text-sm font-bold text-white tracking-tight">More Options</h3>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1 py-1">
              {/* Item 1: In-call messages (Chat) */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onToggleChat();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                    <ChatIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">In-call messages</div>
                    <div className="text-[11px] text-white/50">Send messages to participants</div>
                  </div>
                </div>
                {unreadMessages > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white">
                    {unreadMessages}
                  </span>
                )}
              </button>

              {/* Item 2: Share screen (Present screen) */}
              {canScreenShare && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    if (nativeShell) {
                      toggleNativeShare();
                    } else {
                      screenShare.toggle();
                    }
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                      <ScreenShareIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Share screen</div>
                      <div className="text-[11px] text-white/50">Present your screen to everyone</div>
                    </div>
                  </div>
                  {(nativeShell ? nativeSharing : screenShare.enabled) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                      Sharing
                    </span>
                  )}
                </button>
              )}

              {/* Item 3: People / Participants */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  onTogglePeople();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                    <PeopleIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">People & Participants</div>
                    <div className="text-[11px] text-white/50">Manage attendees, admission & ring</div>
                  </div>
                </div>
              </button>

              {/* Item 4: Call Layout Switcher */}
              {onViewModeChange && (
                <div className="p-3 rounded-2xl bg-white/5 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <LayoutIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Call Layout</div>
                      <div className="text-[10px] text-white/50">Switch stage layout mode</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                    {VIEW_MODES.map((m) => {
                      const selected = viewMode === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            onViewModeChange(m.id);
                            setMoreMenuOpen(false);
                          }}
                          className="py-1.5 px-1 rounded-xl text-center cursor-pointer transition-all duration-150 border text-[11px] font-medium"
                          style={{
                            background: selected ? 'rgba(0, 122, 255, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                            borderColor: selected ? 'rgba(0, 122, 255, 0.6)' : 'rgba(255, 255, 255, 0.1)',
                            color: selected ? '#93c5fd' : '#e5e7eb',
                          }}
                        >
                          {m.id === 'gallery' ? 'Grid' : m.id === 'speaker' ? 'Speaker' : 'Active'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Item 5: Visual effects (Background blur & virtual backgrounds) */}
              {onToggleEffects && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onToggleEffects();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                      <SparklesIcon className="w-5 h-5 text-[#ffb787]" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Apply visual effects</div>
                      <div className="text-[11px] text-white/50">Background blur, masjid & wallpapers</div>
                    </div>
                  </div>
                </button>
              )}

              {/* Item 5: Flip Camera (if mobile / multi-camera) */}
              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    cycleCamera();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                      <FlipCameraIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Switch camera</div>
                      <div className="text-[11px] text-white/50">Toggle front and back cameras</div>
                    </div>
                  </div>
                </button>
              )}

              {/* Item 6: Audio & Video Device Settings */}
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setSettingsOpen(true);
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                    <SettingsIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">Settings & Audio Output</div>
                    <div className="text-[11px] text-white/50">Speaker, Bluetooth, microphone & camera</div>
                  </div>
                </div>
              </button>

              {/* Item 7: Meeting Info & Invite Link */}
              {onToggleMeetingInfo && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onToggleMeetingInfo();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-white/10 text-left transition cursor-pointer"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0">
                      <InfoIcon className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Meeting details</div>
                      <div className="text-[11px] text-white/50">Meeting ID, invite link & share sheet</div>
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* GOOGLE MEET DEVICE SETTINGS MODAL */}
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-[75] bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-6 z-[76] w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-y-auto max-h-[75vh]"
            style={{
              background: 'rgba(32, 28, 25, 0.95)',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">Audio & Video Devices</h3>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <SpeakerDeviceSelect
                devices={speakers}
                value={audioOutputDeviceId}
                onChange={(id) => {
                  setAudioOutputDeviceId(id);
                  room.switchActiveDevice('audiooutput', id).catch(() => {});
                }}
                onRefresh={refreshDevices}
              />
              <DeviceSelect
                label="Microphone"
                devices={mics}
                value={room.getActiveDevice('audioinput')}
                onChange={(id) => room.switchActiveDevice('audioinput', id).catch(() => {})}
                disabled={!mic.enabled}
              />
              <DeviceSelect
                label="Camera"
                devices={cameras}
                value={room.getActiveDevice('videoinput')}
                onChange={(id) => room.switchActiveDevice('videoinput', id).catch(() => {})}
                disabled={!camera.enabled}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}

