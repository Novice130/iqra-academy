'use client';

/**
 * Pre-join screen — Google Meet's "ready to join?" step: a live self-preview
 * with every control sitting on the video itself, and a live mic level so you
 * can see the microphone is actually picking you up before the class starts.
 *
 * One column, preview-first. The device pickers used to sit in a second column
 * beside it, which meant that on a phone — where most of this app's students
 * are — the preview was a postage stamp above a stack of dropdowns. They live
 * behind the gear tile now, where they are reached about as often as they are
 * needed.
 *
 * Everything here runs on raw getUserMedia, not LiveKit hooks: there is no
 * Room yet at this point in the flow. The choices are handed to the caller
 * and applied when the room connects — see LiveKitRoom.
 *
 * Inline styles, not classNames, for anything visual: the call screens have
 * been broken twice by a utility class that silently never applied, and this
 * one has to render correctly the first time on a phone that is about to be in
 * a lesson. Same rule as IncomingCallOverlay.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LocalVideoTrack } from 'livekit-client';
import { CameraIcon, CameraOffIcon, EffectsIcon, MicIcon, MicOffIcon, SettingsIcon } from './CallIcons';
import {
  BackgroundEffectsContent,
  usePreviewBackgroundEffects,
  type EffectSelection,
} from './BackgroundEffects';

export interface JoinChoices {
  videoEnabled: boolean;
  audioEnabled: boolean;
  videoDeviceId?: string;
  audioDeviceId?: string;
  audioOutputDeviceId?: string;
  /** Background chosen here, re-applied to the real camera track on join. */
  backgroundEffect?: EffectSelection;
}

interface PreJoinScreenProps {
  userName: string;
  onJoin: (choices: JoinChoices) => void;
}

function describeMediaError(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError')
    return 'Camera or microphone access denied. Allow permission in your browser settings and try again.';
  if (name === 'NotFoundError') return 'No camera or microphone found on this device.';
  if (name === 'NotReadableError') return 'Your camera or microphone is already in use by another app or tab.';
  return 'Could not access your camera or microphone. Check your device and permissions.';
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
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/45 mb-1">{label}</span>
      <select
        value={value ?? devices[0]?.deviceId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 rounded-lg text-sm cursor-pointer disabled:opacity-50"
        style={{ background: '#2a2d33', color: '#e8eaed', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        {devices.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Phones get a portrait preview, desktops a 16:9 one.
 *
 * A landscape preview on a 360px phone is a 200px-tall strip with the controls
 * sitting across the middle of your own face — and a phone camera is portrait
 * anyway, so the 16:9 box was mostly letterboxing. The iOS device check uses
 * the same 3:4. This is a media query in JavaScript because every visual value
 * on this screen is an inline style; see the note at the top of the file.
 */
function useNarrowViewport() {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return narrow;
}

export default function PreJoinScreen({ userName, onJoin }: PreJoinScreenProps) {
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [videoDeviceId, setVideoDeviceId] = useState<string>();
  const [audioDeviceId, setAudioDeviceId] = useState<string>();
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [joinHeld, setJoinHeld] = useState(false);
  const narrow = useNarrowViewport();
  const effects = usePreviewBackgroundEffects(previewTrack);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopStream = useCallback(() => {
    // Stopping the LocalVideoTrack also tears down any processor attached to
    // it; the underlying MediaStreamTrack is stopped with the raw stream.
    previewTrackRef.current?.stop();
    previewTrackRef.current = null;
    setPreviewTrack(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }, []);

  // Device labels are empty until permission has been granted once, so the
  // list is (re)read after every successful getUserMedia rather than upfront.
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === 'videoinput'));
      setMics(all.filter((d) => d.kind === 'audioinput'));
      setSpeakers(all.filter((d) => d.kind === 'audiooutput'));
    } catch {
      // Nothing to show; the selects just stay hidden.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const open = async () => {
      stopStream();
      if (!videoEnabled && !audioEnabled) return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoEnabled ? (videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true) : false,
          audio: audioEnabled ? (audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true) : false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setError(null);
        refreshDevices();

        // Wrap the raw camera track in a LiveKit LocalVideoTrack so the same
        // background processors used in-call can run on the preview, and
        // attach *that* to the <video> so what you see is the processed
        // output, not the bare camera.
        const rawVideo = stream.getVideoTracks()[0];
        if (rawVideo && videoRef.current) {
          const lkTrack = new LocalVideoTrack(rawVideo);
          previewTrackRef.current = lkTrack;
          setPreviewTrack(lkTrack);
          lkTrack.attach(videoRef.current);
        }

        // Mic level meter — the cheap reassurance that the right microphone
        // is selected, without having to join and ask "can you hear me?".
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new Ctx();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let peak = 0;
            for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
            setLevel(Math.min(1, peak / 60));
            rafRef.current = requestAnimationFrame(tick);
          };
          tick();
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Pre-join media error', err);
        setError(describeMediaError(err));
        setVideoEnabled(false);
        setAudioEnabled(false);
      }
    };

    open();
    return () => {
      cancelled = true;
    };
    // stopStream/refreshDevices are stable useCallbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoEnabled, audioEnabled, videoDeviceId, audioDeviceId]);

  useEffect(() => {
    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
  }, [refreshDevices]);

  useEffect(() => stopStream, [stopStream]);

  const join = () => {
    stopStream();
    onJoin({
      videoEnabled,
      audioEnabled,
      videoDeviceId,
      audioDeviceId,
      audioOutputDeviceId,
      backgroundEffect: effects.selection,
    });
  };

  return (
    <div style={styles.page}>
      <div style={styles.column}>
        <header style={styles.header}>
          <h1 style={styles.title}>Ready to join?</h1>
          <p style={styles.subtitle}>Check your camera and microphone before the class starts.</p>
        </header>

        {/* The preview is the screen. Everything else floats on it. */}
        <div style={{ ...styles.stage, aspectRatio: narrow ? '3 / 4' : '16 / 9', maxHeight: '62vh' }}>
          {videoEnabled ? (
            // Mirrored, like every other call app — an un-mirrored self-view
            // reads as "wrong" even though it's what others see.
            <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
          ) : (
            <div style={styles.cameraOff}>
              <CameraOffIcon />
              <span style={styles.cameraOffLabel}>Camera is off</span>
            </div>
          )}

          <div style={styles.nameChip}>{userName}</div>

          {/* Mic level, only while the mic is live */}
          {audioEnabled && (
            <div style={styles.meter}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 3,
                    borderRadius: 999,
                    transition: 'background 120ms linear',
                    height: 5 + i * 3,
                    background: level * 5 > i ? '#43e3a0' : 'rgba(255,255,255,0.28)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Panels sit above the tiles, and only one is ever open. */}
          {effectsOpen && videoEnabled && (
            <div style={styles.panel}>
              <BackgroundEffectsContent effects={effects} />
            </div>
          )}

          {settingsOpen && (
            <div style={{ ...styles.panel, padding: '14px 14px 16px' }}>
              <div style={styles.panelTitle}>Devices</div>
              <div style={styles.deviceStack}>
                <DeviceSelect
                  label="Camera"
                  devices={cameras}
                  value={videoDeviceId}
                  onChange={setVideoDeviceId}
                  disabled={!videoEnabled}
                />
                <DeviceSelect
                  label="Microphone"
                  devices={mics}
                  value={audioDeviceId}
                  onChange={setAudioDeviceId}
                  disabled={!audioEnabled}
                />
                <DeviceSelect
                  label="Speaker"
                  devices={speakers}
                  value={audioOutputDeviceId}
                  onChange={setAudioOutputDeviceId}
                />
              </div>
            </div>
          )}

          <div style={styles.tileRow}>
            <ControlTile
              on={audioEnabled}
              label={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
              onClick={() => setAudioEnabled((v) => !v)}
            >
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </ControlTile>
            <ControlTile
              on={videoEnabled}
              label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
              onClick={() => {
                setError(null);
                setVideoEnabled((v) => !v);
              }}
            >
              {videoEnabled ? <CameraIcon /> : <CameraOffIcon />}
            </ControlTile>
            <ControlTile
              on
              highlighted={effectsOpen || effects.active}
              disabled={!videoEnabled}
              label="Background effects"
              onClick={() => {
                setSettingsOpen(false);
                setEffectsOpen((v) => !v);
              }}
            >
              <EffectsIcon />
            </ControlTile>
            <ControlTile
              on
              highlighted={settingsOpen}
              label="Camera, microphone and speaker"
              onClick={() => {
                setEffectsOpen(false);
                setSettingsOpen((v) => !v);
              }}
            >
              <SettingsIcon />
            </ControlTile>
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          type="button"
          onClick={join}
          onPointerDown={() => setJoinHeld(true)}
          onPointerUp={() => setJoinHeld(false)}
          onPointerLeave={() => setJoinHeld(false)}
          style={{ ...styles.join, ...(joinHeld ? styles.joinHeld : null) }}
        >
          Join Class
        </button>

        <p style={styles.footnote}>Your background carries into the call.</p>
      </div>
    </div>
  );
}

/**
 * A control that sits on the video: translucent, lit along its top edge and
 * casting a shadow onto the picture behind it, so it reads as a physical tile
 * rather than a flat disc drawn on the frame.
 *
 * The recipe is the one the iOS control bar already uses (ultraThinMaterial, a
 * hairline white rim, a shadow underneath) rather than a second invention, so
 * the two apps look like the same product.
 */
function ControlTile({
  on,
  highlighted,
  disabled,
  label,
  onClick,
  children,
}: {
  on: boolean;
  highlighted?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [held, setHeld] = useState(false);

  const surface: React.CSSProperties = !on
    ? {
        // Off is the one state that must be unmistakable at a glance.
        background: 'linear-gradient(180deg, #f2564a 0%, #ea4335 55%, #c5342a 100%)',
        border: '1px solid rgba(255,255,255,0.26)',
        color: '#fff',
      }
    : highlighted
      ? {
          background: 'linear-gradient(180deg, rgba(67,227,160,0.95) 0%, rgba(52,201,138,0.92) 100%)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#08331f',
        }
      : {
          background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 100%)',
          border: '1px solid rgba(255,255,255,0.28)',
          color: '#fff',
        };

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        ...styles.tile,
        ...surface,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transform: held && !disabled ? 'translateY(2px)' : 'translateY(0)',
        boxShadow: held && !disabled ? TILE_SHADOW_HELD : TILE_SHADOW,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Every colour, radius and shadow in one place, as inline style objects. See
 * the note at the top of the file for why none of this is a utility class.
 */
const TILE_SIZE = 'clamp(52px, 13.5vw, 64px)';

/** Swapped wholesale on press, so they live outside the style map. */
const TILE_SHADOW =
  '0 10px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -6px 12px rgba(0,0,0,0.16)';
const TILE_SHADOW_HELD =
  '0 3px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -4px 10px rgba(0,0,0,0.22)';

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 14px calc(16px + env(safe-area-inset-bottom))',
    background: 'radial-gradient(120% 90% at 50% -10%, #1d2430 0%, #131417 55%, #0c0d10 100%)',
  },
  column: {
    width: '100%',
    maxWidth: 820,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  header: { textAlign: 'center' },
  title: { fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 600, color: '#fff', margin: 0 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' },
  stage: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 24,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0b0c0f',
    border: '1px solid rgba(255,255,255,0.10)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
  cameraOff: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    color: 'rgba(255,255,255,0.35)',
  },
  cameraOffLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
  },
  nameChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    padding: '5px 10px',
    borderRadius: 10,
    fontSize: 12,
    color: '#e8eaed',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  },
  meter: {
    position: 'absolute',
    top: 12,
    right: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '7px 9px',
    borderRadius: 10,
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  },
  panel: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: `calc(${TILE_SIZE} + 28px)`,
    maxHeight: '68%',
    overflowY: 'auto',
    borderRadius: 18,
    background: 'rgba(20,22,26,0.86)',
    border: '1px solid rgba(255,255,255,0.16)',
    backdropFilter: 'blur(20px) saturate(150%)',
    WebkitBackdropFilter: 'blur(20px) saturate(150%)',
    boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 10,
  },
  deviceStack: { display: 'flex', flexDirection: 'column', gap: 10 },
  tileRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(8px, 2.5vw, 14px)',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    transition: 'transform 90ms ease, box-shadow 90ms ease, background 140ms ease',
  },
  error: {
    width: '100%',
    fontSize: 12,
    borderRadius: 12,
    padding: '10px 12px',
    margin: 0,
    background: 'rgba(234,67,53,0.12)',
    border: '1px solid rgba(234,67,53,0.35)',
    color: '#f6a6a0',
  },
  // The site's green, turned up. --color-sage is the brand but it is a muted
  // colour and a muted "go" button is a worse button; this is the same family
  // as the speaking ring on the call screen and Theme.live on iOS.
  join: {
    width: 'min(380px, 100%)',
    padding: '17px 28px',
    marginTop: 2,
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.34)',
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: '0.01em',
    color: '#08331f',
    cursor: 'pointer',
    background: 'linear-gradient(160deg, #43e3a0 0%, #34c98a 45%, #10b981 100%)',
    boxShadow:
      '0 10px 24px rgba(52,201,138,0.38), 0 2px 0 rgba(255,255,255,0.35) inset, 0 -6px 14px rgba(4,84,58,0.35) inset',
    transform: 'translateY(0)',
    transition: 'transform 90ms ease, box-shadow 90ms ease',
  },
  joinHeld: {
    transform: 'translateY(3px)',
    boxShadow:
      '0 3px 10px rgba(52,201,138,0.30), 0 1px 0 rgba(255,255,255,0.25) inset, 0 -4px 10px rgba(4,84,58,0.40) inset',
  },
  footnote: { fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, textAlign: 'center' },
};
