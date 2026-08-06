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
  LayoutIcon,
  LeaveIcon,
  MicIcon,
  MicOffIcon,
  PeopleIcon,
  ScreenShareIcon,
} from './CallIcons';

type MenuId = 'mic' | 'camera' | 'effects' | 'view' | null;

/**
 * Per-viewer layout. Local only, never synced — `speaker` follows the room's
 * spotlight, `active` follows whoever is talking, and they're different
 * things: a teacher can spotlight a student who then goes quiet.
 */
export type ViewMode = 'speaker' | 'gallery' | 'active';

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

/** What each layout actually does, in the words of someone in a lesson. */
const VIEW_MODES: { id: ViewMode; label: string; hint: string }[] = [
  { id: 'speaker', label: 'Speaker', hint: 'The spotlighted person fills the screen' },
  { id: 'gallery', label: 'Gallery', hint: 'Everyone in an equal grid' },
  { id: 'active', label: 'Active speaker', hint: 'Follows whoever is talking' },
];

export default function CallControlBar({
  effects,
  unreadMessages,
  chatOpen,
  peopleOpen,
  onToggleChat,
  onTogglePeople,
  viewMode,
  onViewModeChange,
}: {
  effects: BackgroundEffects;
  unreadMessages: number;
  chatOpen: boolean;
  peopleOpen: boolean;
  onToggleChat: () => void;
  onTogglePeople: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const room = useRoomContext();
  const [menu, setMenu] = useState<MenuId>(null);
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

        {/* Backgrounds are a set-once thing; People is where the guest link
            and ringing a student live, and a teacher needs it mid-class. On a
            narrow phone only one of the two fits, so this is the one that
            stays — backgrounds move into the view menu below. */}
        <span className="hidden sm:contents">
          <RoundButton
            label="Background effects"
            active={menu === 'effects' || effects.active}
            onClick={() => toggleMenu('effects')}
          >
            <EffectsIcon />
          </RoundButton>
        </span>

        <RoundButton label="Chat" active={chatOpen} badge={chatOpen ? 0 : unreadMessages} onClick={onToggleChat}>
          <ChatIcon />
        </RoundButton>

        <RoundButton label="People" active={peopleOpen} onClick={onTogglePeople}>
          <PeopleIcon />
        </RoundButton>

        <RoundButton label="View options" active={menu === 'view'} onClick={() => toggleMenu('view')}>
          <LayoutIcon />
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

      {menu === 'view' && (
        <Popover onClose={() => setMenu(null)}>
          <div className="p-2">
            {/* Layout only. Muting, spotlight, people and the invite link all
                have their own button or live in the People panel — repeating
                them here was the "jargon" the bar was rebuilt to get rid of. */}
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
              View
            </div>
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left cursor-pointer"
                  style={{ background: selected ? 'rgba(138,180,248,0.16)' : 'transparent' }}
                >
                  <span className="w-4 shrink-0 text-sm" style={{ color: '#8ab4f8' }}>
                    {selected ? '✓' : ''}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm" style={{ color: selected ? '#8ab4f8' : '#e8eaed' }}>
                      {m.label}
                    </span>
                    <span className="block text-[11px] text-white/45">{m.hint}</span>
                  </span>
                </button>
              );
            })}

            {/* Backgrounds lose their own button under 640px — the row
                overflows there — so on a phone this menu is the way in. */}
            <div className="sm:hidden">
              <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
              <button
                type="button"
                onClick={() => setMenu('effects')}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer"
                style={{ color: '#e8eaed' }}
              >
                Background effects{effects.active ? ' — on' : ''}
              </button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}
