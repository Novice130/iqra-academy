'use client';

/**
 * Pre-join screen — Google Meet's "ready to join?" step: a live self-preview
 * with the mic and camera toggles sitting on it, the device pickers next to
 * it, and a live mic level so you can see the microphone is actually picking
 * you up before the class starts.
 *
 * Everything here runs on raw getUserMedia, not LiveKit hooks: there is no
 * Room yet at this point in the flow. The choices are handed to the caller
 * and applied when the room connects — see LiveKitRoom.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LocalVideoTrack } from 'livekit-client';
import { CameraIcon, CameraOffIcon, EffectsIcon, MicIcon, MicOffIcon } from './CallIcons';
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8" style={{ background: '#131417' }}>
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.4fr_1fr] gap-6 lg:gap-10 items-center">
        {/* Preview */}
        <div>
          <div
            className="relative w-full aspect-video rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: '#0b0c0f', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {videoEnabled ? (
              // Mirrored, like every other call app — an un-mirrored
              // self-view reads as "wrong" even though it's what others see.
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            ) : (
              <div className="flex flex-col items-center gap-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
                <CameraOffIcon className="w-10 h-10" />
                <span className="text-xs uppercase tracking-wider font-semibold">Camera is off</span>
              </div>
            )}

            <div
              className="absolute top-3 left-3 px-2.5 py-1 rounded-md text-xs"
              style={{ background: 'rgba(0,0,0,0.55)', color: '#e8eaed' }}
            >
              {userName}
            </div>

            {/* Mic level, only while the mic is live */}
            {audioEnabled && (
              <div
                className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1.5 rounded-md"
                style={{ background: 'rgba(0,0,0,0.55)' }}
              >
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="w-1 rounded-full transition-all"
                    style={{
                      height: 4 + i * 3,
                      background: level * 5 > i ? '#8ab4f8' : 'rgba(255,255,255,0.25)',
                    }}
                  />
                ))}
              </div>
            )}

            {/* Toggles sit on the preview, Meet-style */}
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setAudioEnabled((v) => !v)}
                aria-label={audioEnabled ? 'Turn off microphone' : 'Turn on microphone'}
                className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: audioEnabled ? 'rgba(255,255,255,0.16)' : '#ea4335', color: '#fff' }}
              >
                {audioEnabled ? <MicIcon /> : <MicOffIcon />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setVideoEnabled((v) => !v);
                }}
                aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
                style={{ background: videoEnabled ? 'rgba(255,255,255,0.16)' : '#ea4335', color: '#fff' }}
              >
                {videoEnabled ? <CameraIcon /> : <CameraOffIcon />}
              </button>
              <button
                type="button"
                onClick={() => setEffectsOpen((v) => !v)}
                aria-label="Background effects"
                disabled={!videoEnabled}
                className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-40"
                style={{
                  background: effectsOpen || effects.active ? '#8ab4f8' : 'rgba(255,255,255,0.16)',
                  color: effectsOpen || effects.active ? '#202124' : '#fff',
                }}
              >
                <EffectsIcon />
              </button>
            </div>

            {effectsOpen && videoEnabled && (
              <div
                className="absolute inset-x-2 bottom-20 rounded-xl overflow-y-auto shadow-2xl"
                style={{ background: 'rgba(32,33,36,0.97)', border: '1px solid rgba(255,255,255,0.14)', maxHeight: '70%' }}
              >
                <BackgroundEffectsContent effects={effects} />
              </div>
            )}
          </div>

          {error && (
            <p
              className="mt-3 text-xs rounded-lg px-3 py-2"
              style={{ background: 'rgba(234,67,53,0.12)', border: '1px solid rgba(234,67,53,0.35)', color: '#f6a6a0' }}
            >
              {error}
            </p>
          )}
        </div>

        {/* Settings + join */}
        <div>
          <h1 className="text-2xl font-semibold text-white">Ready to join?</h1>
          <p className="text-sm mt-1 mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Check your camera and microphone before the class starts.
          </p>

          <div className="space-y-3">
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

          <button
            onClick={join}
            className="mt-7 w-full py-3.5 rounded-full font-semibold cursor-pointer transition-transform active:scale-[0.98]"
            style={{ background: '#8ab4f8', color: '#202124' }}
          >
            Join Meeting
          </button>

          <p className="text-[11px] mt-3 text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Your background carries into the call.
          </p>
        </div>
      </div>
    </div>
  );
}
