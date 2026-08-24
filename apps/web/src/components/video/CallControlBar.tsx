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
  FlipCameraIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  ScreenShareIcon,
} from './CallIcons';

type MenuId = 'mic' | 'camera' | null;

export type ViewMode = 'speaker' | 'gallery' | 'active';

const DANGER_GRADIENT = 'linear-gradient(180deg, rgba(255, 69, 58, 0.88) 0%, rgba(215, 0, 21, 0.88) 100%)';
const ACTIVE_GRADIENT = 'linear-gradient(135deg, rgba(0, 122, 255, 0.42) 0%, rgba(0, 90, 220, 0.30) 100%)';
const ON_BG = 'rgba(255, 255, 255, 0.12)';

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
      className="relative rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 shrink-0 hover:brightness-110"
      style={{
        width: 'var(--call-btn)',
        height: 'var(--call-btn)',
        background: danger ? DANGER_GRADIENT : active ? ACTIVE_GRADIENT : ON_BG,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        color: '#fff',
        border: danger
          ? '1px solid rgba(255, 255, 255, 0.32)'
          : active
            ? '1px solid rgba(120, 190, 255, 0.50)'
            : '1px solid rgba(255, 255, 255, 0.18)',
        boxShadow: danger
          ? '0 6px 18px rgba(255, 59, 48, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 0 rgba(0, 0, 0, 0.20)'
          : active
            ? '0 6px 20px rgba(0, 122, 255, 0.40), inset 0 1px 0 0 rgba(255, 255, 255, 0.65), inset 0 -1px 0 0 rgba(0, 122, 255, 0.25)'
            : '0 4px 12px rgba(0, 0, 0, 0.20), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.06)',
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
      className="flex items-center rounded-full shrink-0 transition-all duration-200"
      style={{
        background: enabled ? ON_BG : DANGER_GRADIENT,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: enabled ? '1px solid rgba(255, 255, 255, 0.18)' : '1px solid rgba(255, 255, 255, 0.32)',
        boxShadow: enabled
          ? '0 4px 12px rgba(0, 0, 0, 0.20), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.06)'
          : '0 6px 18px rgba(255, 59, 48, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 0 rgba(0, 0, 0, 0.20)',
      }}
    >
      <button
        type="button"
        onClick={() => toggle()}
        disabled={pending}
        title={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
        aria-label={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
        className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-60 transition-transform active:scale-95 hover:brightness-110"
        style={{ width: 'var(--call-btn)', height: 'var(--call-btn)', color: '#fff' }}
      >
        <Icon />
      </button>
      <button
        type="button"
        onClick={onToggleMenu}
        title={`${label} options`}
        aria-label={`${label} options`}
        className="rounded-r-full flex items-center justify-center cursor-pointer shrink-0 border-l transition-all hover:brightness-125"
        style={{
          width: 'calc(var(--call-btn) * 0.48)',
          height: 'var(--call-btn)',
          color: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.18)',
          opacity: menuOpen ? 1 : 0.8,
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
          background: 'rgba(24, 26, 34, 0.78)',
          backdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
          WebkitBackdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
          border: '1px solid rgba(255, 255, 255, 0.20)',
          boxShadow:
            '0 24px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
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
  isHost,
  onEndClassIntent,
  unreadMessages,
  chatOpen,
  peopleOpen,
  onToggleChat,
  onTogglePeople,
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
}) {
  const room = useRoomContext();
  const [menu, setMenu] = useState<MenuId>(null);
  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });
  const [nativePending, setNativePending] = useState(false);
  const [nativeSharing, setNativeSharingState] = useState(false);

  const nativeShell = isNativeShell();
  const sessionId = sessionIdFromRoom(room.name);

  useEffect(() => {
    if (!nativeShell) return;
    setNativeSharingState(getNativeSharing());
    return subscribeNativeSharing((active) => setNativeSharingState(active));
  }, [nativeShell]);

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

  const toggleMenu = (target: MenuId) => {
    setMenu((curr) => (curr === target ? null : target));
  };

  return (
    <>
      {/* Floating frosted glassmorphic pill bar */}
      <div
        className="fixed inset-x-0 bottom-3 sm:bottom-5 z-40 flex justify-center px-2 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="call-control-bar pointer-events-auto flex items-center gap-1.5 sm:gap-3 px-2 sm:px-4 py-1.5 rounded-full shrink-0 overflow-x-auto max-w-[96vw]"
          style={{
            background: 'rgba(24, 26, 34, 0.50)',
            backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
            WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
            border: '1px solid rgba(255, 255, 255, 0.20)',
            boxShadow:
              '0 20px 48px rgba(0, 0, 0, 0.40), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
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

          <RoundButton
            label="Chat"
            active={chatOpen}
            badge={chatOpen ? 0 : unreadMessages}
            onClick={onToggleChat}
          >
            <ChatIcon />
          </RoundButton>

          <RoundButton label="Add people / Participants" active={peopleOpen} onClick={onTogglePeople}>
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
            className="flex items-center justify-center gap-1.5 px-3.5 sm:px-5 rounded-full text-white font-bold cursor-pointer transition-all duration-200 active:scale-95 shrink-0 hover:brightness-110"
            style={{
              height: 'var(--call-btn)',
              background: DANGER_GRADIENT,
              border: '1px solid rgba(255, 255, 255, 0.35)',
              boxShadow:
                '0 8px 24px rgba(255, 59, 48, 0.50), inset 0 1px 0 0 rgba(255, 255, 255, 0.60), inset 0 -1px 0 0 rgba(0, 0, 0, 0.25)',
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
    </>
  );
}
