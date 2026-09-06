'use client';

/**
 * Pre-join screen — Exact Zoom macOS "Video Preview" replica (media_1788654836916.png):
 * - Window Header: macOS Traffic Lights (Red #FF5F56, Yellow #FFBD2E, Green #27C93F) + "[Host Name]'s Zoom Meeting"
 * - Video Preview Container: 16:10 live video stream with mirror transform.
 * - Floating Apple Liquid Glass Pill:
 *     - [Audio] button (mic icon + label, red mute slash when disabled)
 *     - Divider
 *     - [Video] button (camera icon + label, red camera off when disabled)
 * - Floating [Backgrounds] button on bottom right of video container.
 * - Side-by-side Device Selectors below video:
 *     - Microphone dropdown with Mic icon + level meter
 *     - Camera dropdown with Camera icon
 * - Bottom Bar:
 *     - Checkbox: "Always show this preview when joining" + ⓘ info icon
 *     - Right button: Apple blue "[ Start ]" (or "[ Join Meeting ]") button
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LocalVideoTrack } from 'livekit-client';
import {
  CameraIcon,
  CameraOffIcon,
  ChevronUpIcon,
  MicIcon,
  MicOffIcon,
  SpeakerIcon,
  ZoomBackgroundsIcon,
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

export default function PreJoinScreen({
  userName,
  recipientName,
  recipientEmail,
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
  const [alwaysShowPreview, setAlwaysShowPreview] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const effects = usePreviewBackgroundEffects(previewTrack);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewTrackRef = useRef<LocalVideoTrack | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  // Derive Zoom window title matching "syed amer's Zoom Meeting"
  const windowTitle = useMemo(() => {
    if (sessionTitle) return `${sessionTitle}`;
    if (recipientName) return `${recipientName}'s Zoom Meeting`;
    if (userName) return `${userName}'s Zoom Meeting`;
    return "Zoom Meeting";
  }, [sessionTitle, recipientName, userName]);

  const meetingSubtitle = useMemo(() => {
    if (joinCode) return `Meeting ID: ${joinCode}`;
    if (recipientEmail) return recipientEmail;
    return null;
  }, [joinCode, recipientEmail]);

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

  const joinWithChoices = () => {
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
    <div
      className="min-h-[100dvh] flex items-center justify-center select-none font-sans p-4"
      style={{
        background: '#121316', // Dark desktop canvas
        color: '#ffffff',
      }}
    >
      {/* Zoom macOS Window Container */}
      <div
        className="w-full max-w-[680px] rounded-[18px] overflow-hidden flex flex-col transition-all animate-fadeIn"
        style={{
          background: 'rgba(28, 29, 34, 0.92)',
          backdropFilter: 'blur(40px) saturate(190%)',
          WebkitBackdropFilter: 'blur(40px) saturate(190%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
        }}
      >
        {/* 1. macOS Window Header */}
        <div className="h-10 px-4 flex items-center justify-between border-b border-white/[0.08] relative">
          {/* macOS Traffic Lights */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBack}
              title="Close"
              aria-label="Close"
              className="w-3 h-3 rounded-full bg-[#FF5F56] hover:brightness-110 active:brightness-90 transition flex items-center justify-center group cursor-pointer"
            >
              <span className="opacity-0 group-hover:opacity-100 text-[8px] text-neutral-900 font-bold leading-none">×</span>
            </button>
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
          </div>

          {/* Window Title */}
          <div className="absolute inset-x-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[13px] font-medium text-white/90 tracking-tight truncate max-w-[60%]">
              {windowTitle}
            </span>
            {meetingSubtitle && (
              <span className="text-[10px] text-white/45 font-normal truncate max-w-[60%] leading-tight">
                {meetingSubtitle}
              </span>
            )}
          </div>

          <div className="w-12" />
        </div>

        {/* 2. Inner Video Container */}
        <div className="p-4 sm:p-5 flex flex-col gap-3">
          <div
            className="relative w-full aspect-[16/10] rounded-xl overflow-hidden flex items-center justify-center border"
            style={{
              background: '#0d0e11',
              borderColor: 'rgba(255, 255, 255, 0.1)',
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
                <div className="w-20 h-20 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center text-2xl font-bold text-white/80 shadow-lg">
                  {(userName || 'Y').charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium tracking-wide text-white/50">
                  Camera is off
                </span>
              </div>
            )}

            {/* Floating Apple Liquid Glass Audio & Video Pill (Center Bottom) */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
              <div
                className="flex items-center rounded-xl p-1 shadow-2xl backdrop-blur-2xl transition border"
                style={{
                  background: 'rgba(24, 25, 30, 0.82)',
                  borderColor: 'rgba(255, 255, 255, 0.16)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                }}
              >
                {/* Audio Button */}
                <button
                  type="button"
                  onClick={() => setAudioEnabled((v) => !v)}
                  title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                  aria-label={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
                  className="flex flex-col items-center justify-center px-4 py-1.5 rounded-lg hover:bg-white/10 transition active:scale-95 cursor-pointer min-w-[56px]"
                >
                  <div className="relative">
                    {audioEnabled ? (
                      <MicIcon className="w-5 h-5 text-white" />
                    ) : (
                      <MicOffIcon className="w-5 h-5 text-[#FF453A]" />
                    )}
                    {audioEnabled && level > 0.05 && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#30D158] animate-pulse" />
                    )}
                  </div>
                  <span className={`text-[10px] font-medium mt-0.5 ${audioEnabled ? 'text-white/80' : 'text-[#FF453A]'}`}>
                    Audio
                  </span>
                </button>

                {/* Subtle Divider */}
                <div className="w-[1px] h-6 bg-white/15 mx-1" />

                {/* Video Button */}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setVideoEnabled((v) => !v);
                  }}
                  title={videoEnabled ? 'Stop Video' : 'Start Video'}
                  aria-label={videoEnabled ? 'Stop Video' : 'Start Video'}
                  className="flex flex-col items-center justify-center px-4 py-1.5 rounded-lg hover:bg-white/10 transition active:scale-95 cursor-pointer min-w-[56px]"
                >
                  {videoEnabled ? (
                    <CameraIcon className="w-5 h-5 text-white" />
                  ) : (
                    <CameraOffIcon className="w-5 h-5 text-[#FF453A]" />
                  )}
                  <span className={`text-[10px] font-medium mt-0.5 ${videoEnabled ? 'text-white/80' : 'text-[#FF453A]'}`}>
                    Video
                  </span>
                </button>
              </div>
            </div>

            {/* Floating Apple Liquid Glass Backgrounds Button (Bottom Right) */}
            <div className="absolute bottom-3 right-3 z-10">
              <button
                type="button"
                onClick={() => setEffectsOpen(true)}
                title="Virtual Backgrounds and Blur"
                aria-label="Backgrounds"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-2xl transition active:scale-95 border cursor-pointer hover:bg-white/15"
                style={{
                  background: effects.active
                    ? 'rgba(10, 132, 255, 0.35)'
                    : 'rgba(24, 25, 30, 0.82)',
                  borderColor: effects.active
                    ? 'rgba(10, 132, 255, 0.5)'
                    : 'rgba(255, 255, 255, 0.16)',
                  boxShadow: '0 6px 18px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                }}
              >
                <ZoomBackgroundsIcon className="w-4 h-4" />
                <span className="text-xs font-medium">Backgrounds</span>
              </button>
            </div>
          </div>

          {/* 3. Side-by-Side Device Selectors below video preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Microphone Selector */}
            <div
              className="relative flex items-center px-3.5 py-2.5 rounded-xl border transition group hover:bg-white/[0.08]"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 255, 255, 0.12)',
              }}
            >
              <MicIcon className="w-4 h-4 text-white/70 shrink-0 mr-2.5" />
              <div className="flex-1 min-w-0 pr-4">
                <span className="block text-[12px] text-white/90 truncate font-medium">
                  {mics.find((m) => m.deviceId === audioDeviceId)?.label ||
                    (mics.length > 0 ? mics[0].label || 'Default Microphone' : 'Default Microphone')}
                </span>
              </div>
              <ChevronUpIcon className="w-3.5 h-3.5 text-white/50 rotate-180 absolute right-3 pointer-events-none" />
              <select
                value={audioDeviceId ?? mics[0]?.deviceId ?? ''}
                onChange={(e) => setAudioDeviceId(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {mics.map((m, idx) => (
                  <option key={m.deviceId || idx} value={m.deviceId} className="bg-neutral-900 text-white">
                    {m.label || `Microphone ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Camera Selector */}
            <div
              className="relative flex items-center px-3.5 py-2.5 rounded-xl border transition group hover:bg-white/[0.08]"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                borderColor: 'rgba(255, 255, 255, 0.12)',
              }}
            >
              <CameraIcon className="w-4 h-4 text-white/70 shrink-0 mr-2.5" />
              <div className="flex-1 min-w-0 pr-4">
                <span className="block text-[12px] text-white/90 truncate font-medium">
                  {cameras.find((c) => c.deviceId === videoDeviceId)?.label ||
                    (cameras.length > 0 ? cameras[0].label || 'Default Camera' : 'Default Camera')}
                </span>
              </div>
              <ChevronUpIcon className="w-3.5 h-3.5 text-white/50 rotate-180 absolute right-3 pointer-events-none" />
              <select
                value={videoDeviceId ?? cameras[0]?.deviceId ?? ''}
                onChange={(e) => setVideoDeviceId(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {cameras.map((c, idx) => (
                  <option key={c.deviceId || idx} value={c.deviceId} className="bg-neutral-900 text-white">
                    {c.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Speaker Selector (when available) */}
            {speakers.length > 1 && (
              <div
                className="sm:col-span-2 relative flex items-center px-3.5 py-2 rounded-xl border transition group hover:bg-white/[0.08]"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                }}
              >
                <SpeakerIcon className="w-4 h-4 text-white/70 shrink-0 mr-2.5" />
                <div className="flex-1 min-w-0 pr-4">
                  <span className="block text-[12px] text-white/90 truncate font-medium">
                    {speakers.find((s) => s.deviceId === audioOutputDeviceId)?.label ||
                      speakers[0]?.label || 'Default Speaker'}
                  </span>
                </div>
                <ChevronUpIcon className="w-3.5 h-3.5 text-white/50 rotate-180 absolute right-3 pointer-events-none" />
                <select
                  value={audioOutputDeviceId ?? speakers[0]?.deviceId ?? ''}
                  onChange={(e) => setAudioOutputDeviceId(e.target.value)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  {speakers.map((s, idx) => (
                    <option key={s.deviceId || idx} value={s.deviceId} className="bg-neutral-900 text-white">
                      {s.label || `Speaker ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-xs text-red-300 text-center">
              {error}
            </div>
          )}
        </div>

        {/* 4. Bottom Action Bar */}
        <div className="px-5 py-4 flex items-center justify-between border-t border-white/[0.08] bg-black/20">
          {/* Always Show Preview Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none group">
            <input
              type="checkbox"
              checked={alwaysShowPreview}
              onChange={(e) => setAlwaysShowPreview(e.target.checked)}
              className="w-4 h-4 rounded border-white/30 text-[#0A84FF] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#0A84FF]"
            />
            <span className="text-xs text-white/75 group-hover:text-white transition">
              Always show this preview when joining
            </span>
            <span
              title="When enabled, you will always see this camera and audio check before entering meetings."
              className="w-4 h-4 rounded-full bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-[10px] font-bold cursor-help"
            >
              ⓘ
            </span>
          </label>

          {/* Start / Join Button */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleBack}
              className="px-4 py-2 rounded-xl text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={joinWithChoices}
              className="px-6 py-2 rounded-xl font-semibold text-xs tracking-wide text-white transition active:scale-95 cursor-pointer shadow-lg hover:brightness-110"
              style={{
                background: '#0A84FF',
                boxShadow: '0 4px 14px rgba(10, 132, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
              }}
            >
              Start
            </button>
          </div>
        </div>
      </div>

      {/* 5. Virtual Backgrounds Apple Liquid Glass Modal */}
      {effectsOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div
            className="w-full max-w-lg rounded-[20px] p-5 shadow-2xl border flex flex-col gap-4 animate-scaleUp"
            style={{
              background: 'rgba(28, 29, 34, 0.94)',
              backdropFilter: 'blur(40px) saturate(190%)',
              WebkitBackdropFilter: 'blur(40px) saturate(190%)',
              borderColor: 'rgba(255, 255, 255, 0.16)',
              boxShadow: '0 30px 80px rgba(0, 0, 0, 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
            }}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <ZoomBackgroundsIcon className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Virtual Backgrounds & Effects
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEffectsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <BackgroundEffectsContent
              effects={effects}
              onSelect={() => setEffectsOpen(false)}
              onClose={() => setEffectsOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
