'use client';

/**
 * Pre-join screen — Modern Apple iOS FaceTime style device check:
 * Live self-preview with background processor, glowing mic level meter,
 * tactile frosted floating control tiles, and vibrant Apple Green Join Class button.
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
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/45 mb-1.5">{label}</span>
      <select
        value={value ?? devices[0]?.deviceId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2.5 rounded-xl text-xs font-medium cursor-pointer disabled:opacity-50 transition"
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          color: '#f3f4f6',
          border: '1px solid rgba(255, 255, 255, 0.15)',
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

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setCameras(all.filter((d) => d.kind === 'videoinput'));
      setMics(all.filter((d) => d.kind === 'audioinput'));
      setSpeakers(all.filter((d) => d.kind === 'audiooutput'));
    } catch {
      // Best-effort
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

        const rawVideo = stream.getVideoTracks()[0];
        if (rawVideo && videoRef.current) {
          const lkTrack = new LocalVideoTrack(rawVideo);
          previewTrackRef.current = lkTrack;
          setPreviewTrack(lkTrack);
          lkTrack.attach(videoRef.current);
        }

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
  }, [videoEnabled, audioEnabled, videoDeviceId, audioDeviceId, stopStream, refreshDevices]);

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
          <h1 style={styles.title}>Ready to join class?</h1>
          <p style={styles.subtitle}>Check your camera and microphone preview before starting.</p>
        </header>

        <div style={{ ...styles.stage, aspectRatio: narrow ? '3 / 4' : '16 / 9', maxHeight: '62vh' }}>
          {videoEnabled ? (
            <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
          ) : (
            <div style={styles.cameraOff}>
              <CameraOffIcon />
              <span style={styles.cameraOffLabel}>Camera is off</span>
            </div>
          )}

          <div style={styles.nameChip}>{userName}</div>

          {audioEnabled && (
            <div style={styles.meter}>
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 3.5,
                    borderRadius: 999,
                    transition: 'background 120ms linear, height 120ms ease',
                    height: 6 + i * 3,
                    background: level * 5 > i ? '#34c98a' : 'rgba(255,255,255,0.25)',
                    boxShadow: level * 5 > i ? '0 0 8px rgba(52, 201, 138, 0.6)' : 'none',
                  }}
                />
              ))}
            </div>
          )}

          {effectsOpen && videoEnabled && (
            <div style={styles.panel}>
              <BackgroundEffectsContent effects={effects} />
            </div>
          )}

          {settingsOpen && (
            <div style={{ ...styles.panel, padding: '16px' }}>
              <div style={styles.panelTitle}>Audio & Video Devices</div>
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
                  label="Speaker Output"
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
              label="Camera, microphone and speaker settings"
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

        <p style={styles.footnote}>Your camera settings and virtual background carry directly into class.</p>
      </div>
    </div>
  );
}

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
        background: 'linear-gradient(180deg, #ff453a 0%, #d70015 100%)',
        border: '1px solid rgba(255,255,255,0.28)',
        color: '#fff',
        boxShadow: '0 4px 14px rgba(255, 69, 58, 0.4)',
      }
    : highlighted
      ? {
        background: 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
        border: '1px solid rgba(255,255,255,0.35)',
        color: '#fff',
        boxShadow: '0 4px 16px rgba(0, 122, 255, 0.45)',
      }
      : {
        background: 'rgba(255,255,255,0.14)',
        border: '1px solid rgba(255,255,255,0.18)',
        color: '#fff',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
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
        transform: held && !disabled ? 'scale(0.95)' : 'scale(1)',
      }}
    >
      {children}
    </button>
  );
}

const TILE_SIZE = 'clamp(48px, 12.5vw, 60px)';

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 16px calc(20px + env(safe-area-inset-bottom))',
    background: 'radial-gradient(120% 90% at 50% -10%, #1c2230 0%, #0e1015 55%, #08090b 100%)',
  },
  column: {
    width: '100%',
    maxWidth: 800,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  header: { textAlign: 'center' },
  title: { fontSize: 'clamp(22px, 5vw, 28px)', fontWeight: 700, color: '#fff', margin: 0, letterSpacing: '-0.02em' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', margin: '6px 0 0' },
  stage: {
    position: 'relative',
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 28,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0c10',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.12)',
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
    fontWeight: 700,
  },
  nameChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    padding: '6px 12px',
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    background: 'rgba(18, 20, 26, 0.75)',
    border: '1px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  meter: {
    position: 'absolute',
    top: 14,
    right: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '8px 10px',
    borderRadius: 9999,
    background: 'rgba(18, 20, 26, 0.75)',
    border: '1px solid rgba(255,255,255,0.14)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: `calc(${TILE_SIZE} + 28px)`,
    maxHeight: '68%',
    overflowY: 'auto',
    borderRadius: 24,
    background: 'rgba(24, 26, 32, 0.90)',
    border: '1px solid rgba(255,255,255,0.18)',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    boxShadow: '0 20px 48px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 12,
  },
  deviceStack: { display: 'flex', flexDirection: 'column', gap: 12 },
  tileRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(8px, 2.5vw, 14px)',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(20px) saturate(180%)',
    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    transition: 'transform 120ms ease, box-shadow 120ms ease, background 140ms ease',
  },
  error: {
    width: '100%',
    fontSize: 12,
    fontWeight: 500,
    borderRadius: 16,
    padding: '12px 16px',
    margin: 0,
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#fca5a5',
  },
  join: {
    width: 'min(380px, 100%)',
    padding: '16px 28px',
    marginTop: 4,
    borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.3)',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#032115',
    cursor: 'pointer',
    background: 'linear-gradient(160deg, #34d399 0%, #10b981 45%, #059669 100%)',
    boxShadow:
      '0 12px 28px rgba(16, 185, 129, 0.4), 0 1px 0 rgba(255,255,255,0.4) inset',
    transform: 'translateY(0)',
    transition: 'transform 100ms ease, box-shadow 100ms ease',
  },
  joinHeld: {
    transform: 'translateY(2px)',
    boxShadow:
      '0 4px 12px rgba(16, 185, 129, 0.3), 0 1px 0 rgba(255,255,255,0.25) inset',
  },
  footnote: { fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0, textAlign: 'center' },
};
