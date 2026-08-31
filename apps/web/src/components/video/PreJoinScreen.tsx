'use client';

/**
 * Pre-join screen — Exact Google Meet Calling / Conversation screen replica:
 * - Top Bar: Back button (←), contact pill with circular avatar, full name & email/subtitle, and 3-dots menu (⋮).
 * - Main Video Card: Large rounded card (rounded-[32px]) with floating dark control pill
 *   (Video camera, Visual effects sparkle, Microphone) and caller/user name label.
 * - Secondary info pill below video card (Avatar thumbnail + contact number / meeting ID).
 * - Bottom Action Sheet: Material You bottom panel with drag handle, circular audio-call button (Phone icon),
 *   and wide peach/amber pill button with Video camera icon + "Call" / "Join".
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LocalVideoTrack } from 'livekit-client';
import {
  BackArrowIcon,
  CameraIcon,
  CameraOffIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PhoneCallIcon,
  SparklesIcon,
  SpeakerIcon,
} from './CallIcons';
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
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientAvatarUrl?: string | null;
  recipientPhone?: string | null;
  sessionTitle?: string | null;
  joinCode?: string | null;
  onJoin: (choices: JoinChoices) => void;
  onBack?: () => void;
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
              Ready
            </span>
          </div>
          <p className="text-[11px] text-white/50 leading-relaxed">
            Audio automatically routes to your phone speaker, Bluetooth headset, or connected headphones.
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

export default function PreJoinScreen({
  userName,
  recipientName,
  recipientEmail,
  recipientAvatarUrl,
  recipientPhone,
  sessionTitle,
  joinCode,
  onJoin,
  onBack,
}: PreJoinScreenProps) {
  const router = useRouter();
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
  const effects = usePreviewBackgroundEffects(previewTrack);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Format 10-digit 3-4-3 Meeting Code
  const formattedJoinCode = useMemo(() => {
    if (!joinCode) return null;
    const digitsOnly = joinCode.replace(/\D/g, '');
    if (digitsOnly.length >= 10) {
      return `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 7)}-${digitsOnly.slice(7, 10)}`;
    }
    const alphaOnly = joinCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (alphaOnly.length >= 10) {
      return `${alphaOnly.slice(0, 3)}-${alphaOnly.slice(3, 7)}-${alphaOnly.slice(7, 10)}`;
    }
    return joinCode;
  }, [joinCode]);

  // Derive display values matching Google Meet header
  const displayName = recipientName || sessionTitle || 'Novice Tutor Classroom';
  const displaySubtitle = recipientEmail || (formattedJoinCode ? `Meeting ID: ${formattedJoinCode}` : 'Live Class');
  const displaySecondary = recipientPhone || (formattedJoinCode ? `• Meeting ID: ${formattedJoinCode}` : `• ${sessionTitle || 'Novice Tutor'}`);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.push('/dashboard');
    }
  };

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
          video: videoEnabled
            ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                ...(videoDeviceId ? { deviceId: { exact: videoDeviceId } } : {}),
              }
            : false,
          audio: audioEnabled
            ? {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 48000,
                ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
              }
            : false,
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

  const joinWithChoices = (videoChoice: boolean, audioChoice: boolean) => {
    stopStream();
    onJoin({
      videoEnabled: videoChoice,
      audioEnabled: audioChoice,
      videoDeviceId,
      audioDeviceId,
      audioOutputDeviceId,
      backgroundEffect: effects.selection,
    });
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col justify-between select-none font-sans"
      style={{
        background: '#1d1917', // Google Meet warm dark background
        color: '#ffffff',
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}
    >
      {/* 1. TOP BAR: Back Arrow + Contact Info Pill + 3-dots Menu */}
      <header className="w-full max-w-xl mx-auto px-4 py-2 flex items-center justify-between z-20">
        <button
          type="button"
          onClick={handleBack}
          aria-label="Back to dashboard"
          title="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          <BackArrowIcon className="w-6 h-6" />
        </button>

        {/* Google Meet Centered Contact Pill */}
        <div
          className="flex items-center gap-3 px-3 py-1.5 rounded-full border shadow-lg max-w-[75%] min-w-0"
          style={{
            background: '#2b2522',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-[#52331c] text-[#ffb787] font-bold text-sm flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
            {recipientAvatarUrl ? (
              <img src={recipientAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              (displayName || 'N').charAt(0).toUpperCase()
            )}
          </div>
          {/* Name & Subtitle */}
          <div className="min-w-0 flex flex-col text-left pr-2">
            <span className="text-sm font-semibold text-white truncate tracking-tight">
              {displayName}
            </span>
            <span className="text-[11px] text-white/50 truncate font-normal">
              {displaySubtitle}
            </span>
          </div>
        </div>

        {/* 3-Dots More Options Menu (Audio Settings, Devices, Feedback) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setEffectsOpen(false);
              setSettingsOpen((v) => !v);
            }}
            aria-label="Settings and devices"
            title="Audio & Video Settings"
            className="w-10 h-10 rounded-full flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            <MoreIcon className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 2. MAIN VIDEO PREVIEW CARD */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-2 w-full max-w-xl mx-auto min-h-0">
        <div
          className="relative w-full aspect-[3/4] sm:aspect-[4/3] max-h-[58vh] rounded-[32px] overflow-hidden flex items-center justify-center shadow-2xl border transition-all"
          style={{
            background: '#111317',
            borderColor: 'rgba(255, 255, 255, 0.10)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          }}
        >
          {videoEnabled ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 text-white/40">
              <div className="w-20 h-20 rounded-full bg-[#2b2522] flex items-center justify-center text-2xl font-bold text-[#ffb787] shadow-lg">
                {(userName || 'Y').charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-white/50">
                Camera is off
              </span>
            </div>
          )}

          {/* Floating Dark Control Pill (Video Camera, Sparkle Effects, Microphone) */}
          <div className="absolute inset-x-0 bottom-4 sm:bottom-6 flex flex-col items-center gap-2 z-10">
            <div
              className="flex items-center gap-5 sm:gap-6 px-5 py-2.5 rounded-full border shadow-2xl backdrop-blur-xl transition-all"
              style={{
                background: 'rgba(20, 20, 24, 0.65)',
                borderColor: 'rgba(255, 255, 255, 0.16)',
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
              }}
            >
              {/* Button 1: Camera Toggle */}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setVideoEnabled((v) => !v);
                }}
                title={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90 hover:bg-white/10"
                style={{
                  color: videoEnabled ? '#ffffff' : '#f87171',
                }}
              >
                {videoEnabled ? <CameraIcon className="w-5 h-5" /> : <CameraOffIcon className="w-5 h-5" />}
              </button>

              {/* Button 2: Visual Effects / Sparkle */}
              <button
                type="button"
                disabled={!videoEnabled}
                onClick={() => {
                  setSettingsOpen(false);
                  setEffectsOpen((v) => !v);
                }}
                title="Visual effects"
                aria-label="Visual effects"
                className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90 hover:bg-white/10 disabled:opacity-40"
                style={{
                  color: effects.active || effectsOpen ? '#ffb787' : '#ffffff',
                }}
              >
                <SparklesIcon className="w-5 h-5" />
              </button>

              {/* Button 3: Microphone Toggle */}
              <button
                type="button"
                onClick={() => setAudioEnabled((v) => !v)}
                title={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                aria-label={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90 hover:bg-white/10"
                style={{
                  color: audioEnabled ? '#ffffff' : '#f87171',
                }}
              >
                {audioEnabled ? <MicIcon className="w-5 h-5" /> : <MicOffIcon className="w-5 h-5" />}
              </button>
            </div>

            {/* Caller / Self Name Label below controls */}
            <div className="text-xs font-medium text-white/90 drop-shadow-md tracking-tight">
              {userName || 'You'}
            </div>
          </div>
        </div>

        {/* Secondary Info Pill directly below video card */}
        <div
          className="mt-3.5 flex items-center gap-2 px-4 py-1.5 rounded-full border text-xs text-white/80 shadow-md"
          style={{
            background: '#2b2522',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center overflow-hidden shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          </div>
          <span className="truncate text-white/70 font-medium">
            {displaySecondary}
          </span>
        </div>

        {error && (
          <div className="mt-3 w-full max-w-sm px-4 py-2 rounded-2xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 text-center">
            {error}
          </div>
        )}
      </main>

      {/* 3. BOTTOM ACTION PANEL (Material You Bottom Sheet with Audio + Video Call buttons) */}
      <footer className="w-full max-w-xl mx-auto px-4 pt-1 z-20">
        <div
          className="w-full rounded-t-[32px] sm:rounded-3xl p-4 sm:p-5 border-t sm:border shadow-2xl flex flex-col items-center"
          style={{
            background: '#241f1c',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          {/* Top Drag Handle Indicator */}
          <div className="w-10 h-1 rounded-full bg-white/20 mb-4" />

          {/* Action Buttons Row */}
          <div className="flex items-center gap-3.5 w-full">
            {/* Left Button: Audio / Voice Call Only */}
            <button
              type="button"
              onClick={() => joinWithChoices(false, true)}
              aria-label="Start voice call"
              title="Voice call (audio only)"
              className="w-15 h-15 sm:w-16 sm:h-16 rounded-full flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all shrink-0 hover:brightness-110"
              style={{
                background: '#52331c',
                color: '#ffb787',
                border: '1px solid rgba(255, 183, 135, 0.25)',
                boxShadow: '0 6px 18px rgba(82, 51, 28, 0.5)',
              }}
            >
              <PhoneCallIcon className="w-6 h-6" />
            </button>

            {/* Right Button: Video Call (Wide Peach/Amber Pill) */}
            <button
              type="button"
              onClick={() => joinWithChoices(videoEnabled, audioEnabled)}
              aria-label="Start video call"
              title="Start video call"
              className="flex-1 h-15 sm:h-16 rounded-full flex items-center justify-center gap-3 font-bold text-base cursor-pointer shadow-xl active:scale-95 transition-all hover:brightness-105"
              style={{
                background: '#ffb787',
                color: '#3e1d00',
                boxShadow: '0 8px 24px rgba(255, 183, 135, 0.35)',
              }}
            >
              <CameraIcon className="w-6 h-6" />
              <span>Call</span>
            </button>
          </div>
        </div>
      </footer>

      {/* 4. GOOGLE MEET VISUAL EFFECTS BOTTOM SHEET */}
      {effectsOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setEffectsOpen(false)}
          />
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-6 z-[71] w-full sm:max-w-lg rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-y-auto max-h-[70vh]"
            style={{
              background: 'rgba(32, 28, 25, 0.95)',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
            <BackgroundEffectsContent
              effects={effects}
              onSelect={() => setEffectsOpen(false)}
              onClose={() => setEffectsOpen(false)}
            />
          </div>
        </>
      )}

      {/* 5. GOOGLE MEET AUDIO & VIDEO DEVICE SETTINGS MODAL */}
      {settingsOpen && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm animate-fadeIn"
            onClick={() => setSettingsOpen(false)}
          />
          <div
            className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-6 z-[71] w-full sm:max-w-md rounded-t-[32px] sm:rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-y-auto max-h-[75vh]"
            style={{
              background: 'rgba(32, 28, 25, 0.95)',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-3" />
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-sm font-bold text-white tracking-tight">
                Audio & Video Settings
              </h3>
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
                onChange={setAudioOutputDeviceId}
                onRefresh={refreshDevices}
              />
              <DeviceSelect
                label="Microphone"
                devices={mics}
                value={audioDeviceId}
                onChange={setAudioDeviceId}
                disabled={!audioEnabled}
              />
              <DeviceSelect
                label="Camera"
                devices={cameras}
                value={videoDeviceId}
                onChange={setVideoDeviceId}
                disabled={!videoEnabled}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

