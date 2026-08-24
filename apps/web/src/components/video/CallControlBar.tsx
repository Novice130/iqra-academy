'use client';

/**
 * Call control bar — Apple iOS 17/18 FaceTime design language:
 * Centered floating frosted glassmorphic pill with sleek circular buttons,
 * tactile mic/camera split toggles with carets, and vibrant Apple Red End/Leave pill.
 */

import { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import {
  useMediaDeviceSelect,
  useRoomContext,
  useTrackToggle,
} from '@livekit/components-react';
import {
  BackgroundEffectsContent,
  type BackgroundEffects,
} from './BackgroundEffects';
import { useCycleCamera, useHasMultipleCameras } from './cameraDevices';
import {
  getNativeSharing,
  isNativeShell,
  sessionIdFromRoom,
  setNativeSharing,
  startNativeScreenShare,
  stopNativeScreenShare,
  subscribeNativeSharing,
} from './nativeScreenShare';
import {
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  ChevronUpIcon,
  EffectsIcon,
  FlipCameraIcon,
  LayoutIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  ScreenShareIcon,
} from './CallIcons';

type MenuId = 'mic' | 'camera' | 'effects' | 'view' | null;

export type ViewMode = 'speaker' | 'gallery' | 'active';

const DANGER_GRADIENT = 'linear-gradient(180deg, #ff453a 0%, #d70015 100%)';
const ACTIVE_GRADIENT = 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)';
const ON_BG = 'rgba(255, 255, 255, 0.14)';

function RoundButton({
  onClick,
  active,
  danger,
  label,
  badge,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="relative rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-95 shrink-0"
      style={{
        width: 'var(--call-btn)',
        height: 'var(--call-btn)',
        background: danger ? DANGER_GRADIENT : active ? ACTIVE_GRADIENT : ON_BG,
        color: '#fff',
        border: danger
          ? '1px solid rgba(255, 255, 255, 0.28)'
          : active
            ? '1px solid rgba(255, 255, 255, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: danger
          ? '0 4px 14px rgba(255, 69, 58, 0.35)'
          : active
            ? '0 4px 16px rgba(0, 122, 255, 0.4)'
            : '0 2px 8px rgba(0, 0, 0, 0.25)',
      }}
    >
      {children}
      {!!badge && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center border border-white/20"
          style={{ background: '#ff3b30', color: '#fff', boxShadow: '0 2px 6px rgba(255, 59, 48, 0.5)' }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function ToggleWithCaret({
  source,
  menuOpen,
  onToggleMenu,
  label,
}: {
  source: Track.Source.Microphone | Track.Source.Camera;
  menuOpen: boolean;
  onToggleMenu: () => void;
  label: string;
}) {
  const { toggle, enabled, pending } = useTrackToggle({ source });
  const isMic = source === Track.Source.Microphone;
  const Icon = isMic ? (enabled ? MicIcon : MicOffIcon) : enabled ? CameraIcon : CameraOffIcon;

  return (
    <div
      className="flex items-center rounded-full shrink-0 transition-all duration-150"
      style={{
        background: enabled ? ON_BG : DANGER_GRADIENT,
        border: enabled ? '1px solid rgba(255, 255, 255, 0.14)' : '1px solid rgba(255, 255, 255, 0.28)',
        boxShadow: enabled ? '0 2px 8px rgba(0, 0, 0, 0.25)' : '0 4px 14px rgba(255, 69, 58, 0.35)',
      }}
    >
      <button
        type="button"
        onClick={() => toggle()}
        disabled={pending}
        title={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
        aria-label={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
        className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-60 transition-transform active:scale-95"
        style={{ width: 'var(--call-btn)', height: 'var(--call-btn)', color: '#fff' }}
      >
        <Icon />
      </button>
      <button
        type="button"
        onClick={onToggleMenu}
        title={`${label} options`}
        aria-label={`${label} options`}
        className="rounded-r-full flex items-center justify-center cursor-pointer shrink-0 border-l transition-opacity"
        style={{
          width: 'calc(var(--call-btn) * 0.48)',
          height: 'var(--call-btn)',
          color: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          opacity: menuOpen ? 1 : 0.75,
        }}
      >
        <ChevronUpIcon className="call-caret" />
      </button>
    </div>
  );
}

function DeviceList({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  if (devices.length === 0) return null;

  return (
    <div className="px-2 py-2">
      <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{label}</div>
      <div className="space-y-0.5">
        {devices.map((d, i) => {
          const active = d.deviceId === activeDeviceId;
          return (
            <button
              key={d.deviceId || i}
              type="button"
              onClick={() => setActiveMediaDevice(d.deviceId)}
              className="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: active ? 'rgba(0, 122, 255, 0.22)' : 'transparent',
                color: active ? '#60a5fa' : '#f3f4f6',
              }}
            >
              <span className="truncate mr-2">{d.label || `${label} ${i + 1}`}</span>
              {active && <span className="text-blue-400 font-bold shrink-0">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Popover({
  onClose,
  wide,
  children,
}: {
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-[96px] z-[71] rounded-3xl overflow-y-auto"
        style={{
          background: 'rgba(24, 26, 32, 0.88)',
          backdropFilter: 'blur(28px) saturate(180%)',
          WebkitBackdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          width: wide ? 'min(94vw, 560px)' : 'min(94vw, 380px)',
          maxHeight: '62vh',
        }}
      >
        {children}
      </div>
    </>
  );
}

export const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'speaker', label: 'Speaker View', hint: 'Spotlighted participant fills the stage' },
  { id: 'gallery', label: 'Gallery Grid', hint: 'All participants in an equal balanced grid' },
  { id: 'active', label: 'Active Speaker', hint: 'Dynamically tracks whoever is speaking' },
];

export default function CallControlBar({
  effects,
  isHost,
  onEndClassIntent,
  unreadMessages,
  chatOpen,
  peopleOpen,
  onToggleChat,
  onTogglePeople,
  viewMode,
  onViewModeChange,
}: {
  effects: BackgroundEffects;
  isHost: boolean;
  onEndClassIntent: () => void;
  unreadMessages: number;
  chatOpen: boolean;
  peopleOpen: boolean;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
}) {
  const room = useRoomContext();
  const [menu, setMenu] = useState<MenuId>(null);
  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

  const [canScreenShare, setCanScreenShare] = useState(false);
  const [nativeShell, setNativeShell] = useState(false);
  const [nativeSharing, setSharingState] = useState(getNativeSharing);
  const [nativePending, setNativePending] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => subscribeNativeSharing(setSharingState), []);

  useEffect(() => {
    const native = isNativeShell();
    setNativeShell(native);
    setCanScreenShare(
      native || (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia)
    );
  }, []);

  useEffect(() => {
    if (!nativeShell) return;
    window.__ntScreenShareEnded = () => {
      setNativeSharing(false);
      setNativePending(false);
    };
    return () => {
      delete window.__ntScreenShareEnded;
    };
  }, [nativeShell]);

  const toggleNativeShare = async () => {
    if (nativePending) return;
    if (nativeSharing) {
      setNativeSharing(false);
      await stopNativeScreenShare();
      return;
    }
    const sessionId = sessionIdFromRoom(room.name);
    if (!sessionId) return;
    setNativePending(true);
    setShareError(null);
    try {
      const result = await startNativeScreenShare(sessionId);
      setNativeSharing(result.started);
      setShareError(result.message);
    } catch {
      setNativeSharing(false);
      setShareError("Couldn't start sharing screen.");
    } finally {
      setNativePending(false);
    }
  };

  useEffect(() => {
    if (!shareError) return;
    const timer = setTimeout(() => setShareError(null), 6000);
    return () => clearTimeout(timer);
  }, [shareError]);

  const toggleMenu = (id: Exclude<MenuId, null>) => setMenu((m) => (m === id ? null : id));

  return (
    <>
      {shareError && (
        <div
          role="status"
          className="fixed inset-x-0 flex justify-center px-4 pointer-events-none"
          style={{ bottom: 'calc(var(--call-bar-height, 84px) + 16px)', zIndex: 60 }}
        >
          <div
            className="max-w-sm rounded-2xl px-4 py-2.5 text-xs font-medium text-center backdrop-blur-xl"
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {shareError}
          </div>
        </div>
      )}

      {/* Floating frosted glassmorphic pill bar */}
      <div
        className="fixed inset-x-0 bottom-3 sm:bottom-5 z-40 flex justify-center px-2 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="call-control-bar pointer-events-auto flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-1.5 rounded-full shrink-0 overflow-x-auto max-w-[96vw]"
          style={{
            background: 'rgba(20, 22, 28, 0.72)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            boxShadow:
              '0 16px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            scrollbarWidth: 'none',
          }}
        >
          <ToggleWithCaret
            source={Track.Source.Microphone}
            label="microphone"
            menuOpen={menu === 'mic'}
            onToggleMenu={() => toggleMenu('mic')}
          />
          <ToggleWithCaret
            source={Track.Source.Camera}
            label="camera"
            menuOpen={menu === 'camera'}
            onToggleMenu={() => toggleMenu('camera')}
          />

          {canScreenShare && (
            <RoundButton
              label={nativeShell && nativePending ? 'Starting screen share…' : 'Present screen'}
              active={nativeShell ? nativeSharing : screenShare.enabled}
              onClick={nativeShell ? toggleNativeShare : () => screenShare.toggle()}
            >
              <ScreenShareIcon />
            </RoundButton>
          )}

          {/* Centered Background Effects Button */}
          <RoundButton
            label="Background effects"
            active={menu === 'effects' || effects.active}
            onClick={() => toggleMenu('effects')}
          >
            <EffectsIcon />
          </RoundButton>

          {onViewModeChange && (
            <RoundButton
              label="View layout"
              active={menu === 'view'}
              onClick={() => toggleMenu('view')}
            >
              <LayoutIcon />
            </RoundButton>
          )}

          <RoundButton
            label="Chat"
            active={chatOpen}
            badge={chatOpen ? 0 : unreadMessages}
            onClick={onToggleChat}
          >
            <ChatIcon />
          </RoundButton>

          <RoundButton label="People" active={peopleOpen} onClick={onTogglePeople}>
            <PeopleIcon />
          </RoundButton>

          {/* Apple FaceTime red pill End/Leave button */}
          <button
            type="button"
            onClick={() => {
              if (isHost) onEndClassIntent();
              room.disconnect();
            }}
            title={isHost ? 'End class for everyone' : 'Leave call'}
            aria-label={isHost ? 'End class for everyone' : 'Leave call'}
            className="flex items-center justify-center gap-1.5 px-3.5 sm:px-5 rounded-full text-white font-bold cursor-pointer transition-all duration-150 active:scale-95 shrink-0"
            style={{
              height: 'var(--call-btn)',
              background: DANGER_GRADIENT,
              border: '1px solid rgba(255, 255, 255, 0.3)',
              boxShadow: '0 4px 16px rgba(255, 69, 58, 0.45)',
            }}
          >
            <LeaveIcon className="shrink-0" />
            <span className="text-xs sm:text-sm font-semibold tracking-tight whitespace-nowrap">
              {isHost ? 'End' : 'Leave'}
            </span>
          </button>
        </div>
      </div>

      {menu === 'mic' && (
        <Popover onClose={() => setMenu(null)}>
          <DeviceList kind="audioinput" label="Microphone" />
          <DeviceList kind="audiooutput" label="Speaker" />
        </Popover>
      )}

      {menu === 'camera' && (
        <Popover onClose={() => setMenu(null)}>
          <DeviceList kind="videoinput" label="Camera" />
          {hasMultipleCameras && (
            <div className="px-2 pb-2">
              <button
                type="button"
                onClick={() => {
                  cycleCamera();
                  setMenu(null);
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
              >
                <FlipCameraIcon /> Flip camera
              </button>
            </div>
          )}
        </Popover>
      )}

      {menu === 'effects' && (
        <Popover wide onClose={() => setMenu(null)}>
          <BackgroundEffectsContent
            effects={effects}
            onSelect={() => setMenu(null)}
            onClose={() => setMenu(null)}
          />
        </Popover>
      )}

      {menu === 'view' && onViewModeChange && (
        <Popover onClose={() => setMenu(null)}>
          <div className="p-2">
            <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">
              Choose Layout
            </div>
            <div className="space-y-1">
              {VIEW_MODES.map((m) => {
                const selected = viewMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onViewModeChange(m.id);
                      setMenu(null);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors"
                    style={{
                      background: selected ? 'rgba(0, 122, 255, 0.22)' : 'transparent',
                    }}
                  >
                    <span className="w-4 shrink-0 text-sm font-bold" style={{ color: '#60a5fa' }}>
                      {selected ? '✓' : ''}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block text-xs font-semibold"
                        style={{ color: selected ? '#93c5fd' : '#f3f4f6' }}
                      >
                        {m.label}
                      </span>
                      <span className="block text-[11px] text-white/45">{m.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
