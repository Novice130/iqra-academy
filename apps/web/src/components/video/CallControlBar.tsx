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
      className="relative rounded-full flex items-center justify-center cursor-pointer transition-colors shrink-0"
      style={{
        // --call-btn shrinks with the viewport (globals.css) so the whole row
        // fits a 360px phone instead of scrolling sideways.
        width: 'var(--call-btn)',
        height: 'var(--call-btn)',
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
        className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-60"
        style={{ width: 'var(--call-btn)', height: 'var(--call-btn)', color: '#fff' }}
      >
        <Icon />
      </button>
      <button
        type="button"
        onClick={onToggleMenu}
        title={`${label} options`}
        aria-label={`${label} options`}
        className="rounded-r-full flex items-center justify-center cursor-pointer shrink-0"
        style={{
          width: 'calc(var(--call-btn) * 0.5)',
          height: 'var(--call-btn)',
          color: '#fff',
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

/**
 * What the teacher is asked when they tap Leave.
 *
 * Centred modal rather than `window.confirm()`: confirm steals focus from the
 * call, and on a phone it renders as a bare system dialog that reads like the
 * page has errored. Backdrop is deliberately light and unblurred — the same
 * mistake was made once on MediaRequestModal, where a near-opaque backdrop
 * blacked out the teacher mid-sentence.
 *
 * Inline styles throughout, matching the rest of the call screen: a className
 * that silently fails to apply has broken this UI twice.
 */
function LeaveSheet({
  onCancel,
  onLeave,
  onEndForEveryone,
}: {
  onCancel: () => void;
  onLeave: () => void;
  onEndForEveryone: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.38)',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(92vw, 360px)',
          borderRadius: 16,
          padding: 20,
          background: '#202124',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          color: '#fff',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 6 }}>Leave this class?</div>
        <div style={{ fontSize: 13, opacity: 0.72, marginBottom: 18, lineHeight: 1.45 }}>
          Ending it closes the class for everyone. Leaving keeps it running, so you can rejoin from
          your dashboard.
        </div>

        <button
          type="button"
          onClick={onEndForEveryone}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 10,
            border: 'none',
            background: '#d93025',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          End class for everyone
        </button>

        <button
          type="button"
          onClick={onLeave}
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'transparent',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 10,
          }}
        >
          Leave — class continues
        </button>

        <button
          type="button"
          onClick={onCancel}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 10,
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
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
  /** The session's own teacher — the only person who is asked before leaving. */
  isHost: boolean;
  /** Arms the end-the-class path. See LiveKitRoom's endOnDisconnectRef. */
  onEndClassIntent: () => void;
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
  /**
   * The host's leave is two different actions wearing one button, and picking
   * the wrong one is expensive in both directions: ending a class by accident
   * throws every student out, and stepping away without ending leaves a room
   * running. So the host is asked. Students still just leave.
   */
  const [leaveOpen, setLeaveOpen] = useState(false);
  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();
  const screenShare = useTrackToggle({ source: Track.Source.ScreenShare });

  // Two different mechanisms behind one button.
  //
  // In a browser it's `getDisplayMedia`, which iOS Safari and Android Chrome
  // don't have — a dead button is worse than none, so it stays hidden there.
  // Inside the Android app there is no getDisplayMedia either, but there IS a
  // native capture path: the shell publishes the screen into this same room
  // (see nativeScreenShare.ts). That's the branch below.
  const [canScreenShare, setCanScreenShare] = useState(false);
  const [nativeShell, setNativeShell] = useState(false);
  const [nativeSharing, setSharingState] = useState(getNativeSharing);
  const [nativePending, setNativePending] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // The share can end from outside this component entirely — the Stop action
  // on the Android notification, or the system cast control — so the button
  // follows the shared store rather than owning the state itself.
  useEffect(() => subscribeNativeSharing(setSharingState), []);

  useEffect(() => {
    const native = isNativeShell();
    setNativeShell(native);
    setCanScreenShare(
      native || (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia)
    );
  }, []);

  // The share can also end from outside the page — the user stops it from the
  // Android notification, or the capture is revoked. The shell calls this so
  // the button doesn't sit there claiming to be on.
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
    // Pending until Android's own "start recording?" dialog is answered —
    // which the user may simply decline, so this cannot assume success.
    setNativePending(true);
    setShareError(null);
    try {
      const result = await startNativeScreenShare(sessionId);
      setNativeSharing(result.started);
      setShareError(result.message);
    } catch {
      setNativeSharing(false);
      setShareError("Couldn't start sharing your screen.");
    } finally {
      setNativePending(false);
    }
  };

  // Clears itself: an error about a share the teacher has since started is
  // worse than no error, and there is no room on a call screen for something
  // that has to be dismissed by hand.
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
          style={{ bottom: 'calc(var(--call-bar-height, 72px) + 12px)', zIndex: 60 }}
        >
          <div
            className="max-w-sm rounded-lg px-3 py-2 text-sm text-center"
            style={{ background: 'rgba(32,33,36,0.95)', color: '#f28b82', border: '1px solid rgba(242,139,130,0.35)' }}
          >
            {shareError}
          </div>
        </div>
      )}

      {/* Every control stays on the bar, including on a phone. Hiding one to
          make room is how "the app has no background button" happens — the
          buttons shrink instead (--call-btn, globals.css), because a 40px row
          needed ~400px and a 360px Samsung pushed the leave button off the
          edge into a sideways scroll nobody thinks to do mid-lesson.

          No justify-center class either: the centring lives in
          .call-control-bar as `safe center`, which degrades to flex-start
          rather than pushing the first buttons off the left edge, where a
          scroll container cannot reach them. */}
      <div
        className="call-control-bar flex items-center gap-1 sm:gap-3 px-1.5 sm:px-3 shrink-0 overflow-x-auto"
        style={{
          background: '#131417',
          borderTop: '1px solid rgba(255,255,255,0.08)',
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
          label="Background effects"
          active={menu === 'effects' || effects.active}
          onClick={() => toggleMenu('effects')}
        >
          <EffectsIcon />
        </RoundButton>

        <RoundButton label="Chat" active={chatOpen} badge={chatOpen ? 0 : unreadMessages} onClick={onToggleChat}>
          <ChatIcon />
        </RoundButton>

        <RoundButton label="People" active={peopleOpen} onClick={onTogglePeople}>
          <PeopleIcon />
        </RoundButton>

        <RoundButton label="View options" active={menu === 'view'} onClick={() => toggleMenu('view')}>
          <LayoutIcon />
        </RoundButton>

        <RoundButton
          label={isHost ? 'Leave or end class' : 'Leave call'}
          danger
          onClick={() => (isHost ? setLeaveOpen(true) : room.disconnect())}
        >
          <LeaveIcon />
        </RoundButton>
      </div>

      {leaveOpen && (
        <LeaveSheet
          onCancel={() => setLeaveOpen(false)}
          onLeave={() => {
            setLeaveOpen(false);
            room.disconnect();
          }}
          onEndForEveryone={() => {
            setLeaveOpen(false);
            // Order matters: arm first, then disconnect. `disconnect()`
            // resolves into onDisconnected, which reads the flag.
            onEndClassIntent();
            room.disconnect();
          }}
        />
      )}

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

          </div>
        </Popover>
      )}
    </>
  );
}
