'use client';

/**
 * Call control bar — Google Meet's layout: one centred row of round buttons
 * at the bottom, with the device pickers folded into a caret attached to the
 * mic and camera buttons instead of living as separate top-bar controls.
 *
 * Replaces LiveKit's own ControlBar for two reasons:
 *   1. Its device menus render inside `.lk-control-bar`, which is an overflow
 *      container here so buttons stay reachable on a narrow phone — an
 *      overflow container clips absolutely-positioned children, so the menu
 *      came out as a sliver stuck inside the bar. Our menus are `fixed`
 *      above the bar and can't be clipped by anything.
 *   2. Everything else (spotlight, mute, add-student, backgrounds) had been
 *      bolted on as its own floating button over the video. They're now a
 *      panel or a menu item reached from here.
 */

import { useEffect, useState } from 'react';
import { Track } from 'livekit-client';
import {
  useLocalParticipant,
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
  CameraIcon,
  CameraOffIcon,
  ChatIcon,
  ChevronUpIcon,
  EffectsIcon,
  FlipCameraIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PeopleIcon,
  ScreenShareIcon,
} from './CallIcons';

type MenuId = 'mic' | 'camera' | 'effects' | 'more' | null;

const OFF_BG = '#ea4335';
const ON_BG = 'rgba(255,255,255,0.12)';

function RoundButton({
  onClick,
  active,
  danger,
  label,
  badge,
  children,
}: {
  onClick: () => void;
  /** Highlighted (panel open / effect on). */
  active?: boolean;
  /** Red — muted, or the leave button. */
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
      className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center cursor-pointer transition-colors shrink-0"
      style={{
        background: danger ? OFF_BG : active ? '#8ab4f8' : ON_BG,
        color: danger ? '#fff' : active ? '#202124' : '#e8eaed',
      }}
    >
      {children}
      {!!badge && badge > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
          style={{ background: '#ea4335', color: '#fff' }}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

/**
 * Mic / camera: the toggle itself plus a caret that opens that device's
 * picker — the pairing Meet uses, so nobody has to hunt for a settings
 * screen to change microphone.
 */
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
    <div className="flex items-center rounded-full shrink-0" style={{ background: enabled ? ON_BG : OFF_BG }}>
      <button
        type="button"
        onClick={() => toggle()}
        disabled={pending}
        title={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
        aria-label={`${enabled ? 'Turn off' : 'Turn on'} ${label}`}
        className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-60"
        style={{ color: '#fff' }}
      >
        <Icon />
      </button>
      <button
        type="button"
        onClick={onToggleMenu}
        title={`${label} options`}
        aria-label={`${label} options`}
        className="w-5 sm:w-6 h-10 sm:h-12 rounded-r-full flex items-center justify-center cursor-pointer"
        style={{ color: '#fff', opacity: menuOpen ? 1 : 0.75 }}
      >
        <ChevronUpIcon />
      </button>
    </div>
  );
}

function DeviceList({ kind, label }: { kind: MediaDeviceKind; label: string }) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  if (devices.length === 0) return null;

  return (
    <div className="px-2 py-2">
      <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</div>
      {devices.map((d, i) => {
        const active = d.deviceId === activeDeviceId;
        return (
          <button
            key={d.deviceId || i}
            type="button"
            onClick={() => setActiveMediaDevice(d.deviceId)}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer truncate"
            style={{ background: active ? 'rgba(138,180,248,0.18)' : 'transparent', color: active ? '#8ab4f8' : '#e8eaed' }}
          >
            {active ? '✓ ' : ''}
            {d.label || `${label} ${i + 1}`}
          </button>
        );
      })}
    </div>
  );
}

/** Popover anchored above the bar. Fixed, so no ancestor can clip it. */
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
        className="fixed left-1/2 -translate-x-1/2 bottom-[88px] z-[71] rounded-2xl shadow-2xl overflow-y-auto"
        style={{
          background: '#202124',
          border: '1px solid rgba(255,255,255,0.12)',
          width: wide ? 'min(94vw, 560px)' : 'min(94vw, 380px)',
          maxHeight: '62vh',
        }}
      >
        {children}
      </div>
    </>
  );
}

export default function CallControlBar({
  sessionId,
  isModerator,
  effects,
  unreadMessages,
  chatOpen,
  peopleOpen,
  onToggleChat,
  onTogglePeople,
  viewMode,
  onViewModeChange,
}: {
  sessionId: string;
  isModerator: boolean;
  effects: BackgroundEffects;
  unreadMessages: number;
  chatOpen: boolean;
  peopleOpen: boolean;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  viewMode: 'speaker' | 'gallery';
  onViewModeChange: (mode: 'speaker' | 'gallery') => void;
}) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [menu, setMenu] = useState<MenuId>(null);
  const [copied, setCopied] = useState(false);
  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

  // Screen share is desktop-only in practice: getDisplayMedia doesn't exist
  // on iOS Safari or Android Chrome, and a dead button is worse than none.
  const [canScreenShare, setCanScreenShare] = useState(false);
  useEffect(() => {
    setCanScreenShare(typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia);
  }, []);

  const toggleMenu = (id: Exclude<MenuId, null>) => setMenu((m) => (m === id ? null : id));

  const copyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/dashboard/session/${sessionId}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <>
      <div
        className="call-control-bar flex items-center justify-center gap-1.5 sm:gap-3 px-2 sm:px-3 shrink-0"
        style={{ background: '#131417', borderTop: '1px solid rgba(255,255,255,0.08)' }}
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
            label="Present screen"
            active={screenShare.enabled}
            onClick={() => screenShare.toggle()}
          >
            <ScreenShareIcon />
          </RoundButton>
        )}

        <RoundButton
          label="Background effects"
          active={menu === 'effects' || effects.active}
          onClick={() => toggleMenu('effects')}
        >
          <EffectsIcon />
        </RoundButton>

        <RoundButton label="Chat" active={chatOpen} badge={chatOpen ? 0 : unreadMessages} onClick={onToggleChat}>
          <ChatIcon />
        </RoundButton>

        <span className="hidden sm:contents">
          <RoundButton label="People" active={peopleOpen} onClick={onTogglePeople}>
            <PeopleIcon />
          </RoundButton>
        </span>

        <RoundButton label="More options" active={menu === 'more'} onClick={() => toggleMenu('more')}>
          <MoreIcon />
        </RoundButton>

        <RoundButton label="Leave call" danger onClick={() => room.disconnect()}>
          <LeaveIcon />
        </RoundButton>
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
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.08)', color: '#e8eaed' }}
              >
                <FlipCameraIcon /> Flip camera
              </button>
            </div>
          )}
        </Popover>
      )}

      {menu === 'effects' && (
        <Popover wide onClose={() => setMenu(null)}>
          <BackgroundEffectsContent effects={effects} />
        </Popover>
      )}

      {menu === 'more' && (
        <Popover onClose={() => setMenu(null)}>
          <div className="p-2">
            {/* Available to everyone: a teacher sometimes wants one student
                big, a student sometimes wants to see the whole class. */}
            <div className="px-1 pb-2">
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                Layout
              </div>
              <div className="flex gap-2 px-2">
                {(['speaker', 'gallery'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onViewModeChange(m)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm font-medium capitalize cursor-pointer"
                    style={{
                      background: viewMode === m ? 'rgba(138,180,248,0.18)' : 'rgba(255,255,255,0.06)',
                      color: viewMode === m ? '#8ab4f8' : '#e8eaed',
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={copyLink}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer"
              style={{ color: '#e8eaed' }}
            >
              {copied ? '✓ Link copied' : 'Copy joining link'}
            </button>

            <button
              type="button"
              onClick={() => {
                localParticipant.setMicrophoneEnabled(false).catch(() => {});
                setMenu(null);
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer"
              style={{ color: '#e8eaed' }}
            >
              Mute my microphone
            </button>

            <button
              type="button"
              onClick={() => {
                onTogglePeople();
                setMenu(null);
              }}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer"
              style={{ color: '#e8eaed' }}
            >
              {isModerator ? 'People — spotlight, mute, ring…' : 'People'}
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}
