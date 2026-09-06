'use client';

/**
 * Call Settings Modal — Apple / Zoom style settings dialog:
 * - Desktop: Left category rail
 * - Mobile: Segmented top tabs
 * - Categories: General, Audio, Video, Backgrounds, Statistics, About
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Track } from 'livekit-client';
import { useRoomContext, useLocalParticipant } from '@livekit/components-react';
import {
  SettingsIcon,
  MicIcon,
  CameraIcon,
  SparklesIcon,
  LayoutIcon,
  InfoIcon,
  StatsBarChartIcon,
} from './CallIcons';
import type { ViewMode } from './CallControlBar';
import { BackgroundEffectsContent, type BackgroundEffects } from './BackgroundEffects';

export type SettingsTab = 'general' | 'audio' | 'video' | 'backgrounds' | 'statistics' | 'about';

interface CallSettingsModalProps {
  onClose: () => void;
  initialTab?: SettingsTab;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onToggleEffects?: () => void;
  /** Same live hook instance the call owns — lets this tab share it instead of duplicating it. */
  effects?: BackgroundEffects | null;
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  audioOutputDeviceId?: string;
  onSelectSpeaker?: (id: string) => void;
}


function useLiveAudioLevel(track?: { attach?: (el: HTMLAudioElement) => unknown } | null): number {
  const [level, setLevel] = useState(0);
  const stateRef = useRef<{ ctx: AudioContext | null; analyser: AnalyserNode | null; raf: number; el: HTMLAudioElement | null }>({
    ctx: null,
    analyser: null,
    raf: 0,
    el: null,
  });
  useEffect(() => {
    const media = (track as unknown as { mediaStreamTrack?: MediaStreamTrack } | null | undefined)?.mediaStreamTrack;
    if (!track || !media) {
      setLevel(0);
      return;
    }
    let cancelled = false;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let raf = 0;
    const el: HTMLAudioElement | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      const src = ctx.createMediaStreamSource(new MediaStream([media]));
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (cancelled || !analyser) return;
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = Math.abs(buf[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        setLevel(peak);
        raf = requestAnimationFrame(tick);
      };
      tick();
      stateRef.current = { ctx, analyser, raf, el };
    } catch {
      setLevel(0);
    }
    return () => {
      cancelled = true;
      try { cancelAnimationFrame(raf); } catch {}
      try { ctx?.close().catch(() => {}); } catch {}
    };
  }, [track]);
  return level;
}

function LiveCameraPreview({ deviceId, mirror }: { deviceId?: string; mirror: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        });
        if (!cancelled && videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        console.warn('Could not start preview camera:', e);
      }
    };
    start();
    return () => {
      cancelled = true;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [deviceId]);

  return (
    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black/80 border border-white/10 shadow-lg flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover transition-transform ${mirror ? '-scale-x-100' : ''}`}
      />
    </div>
  );
}

function SegmentedAudioMeter({ level }: { level: number }) {
  const totalSegments = 16;
  const activeSegments = Math.round(Math.min(1, Math.max(0, level * 2.8)) * totalSegments);
  return (
    <div className="flex items-center gap-1 w-full h-2.5">
      {Array.from({ length: totalSegments }).map((_, i) => (
        <div
          key={i}
          className={`flex-1 h-full rounded-xs transition-colors duration-75 ${
            i < activeSegments ? 'bg-[#0A84FF] shadow-sm shadow-blue-500/50' : 'bg-white/10'
          }`}
        />
      ))}
    </div>
  );
}

function playTestSpeakerChime() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.12 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.12);
      osc.stop(ctx.currentTime + idx * 0.12 + 0.36);
    });
  } catch {}
}

export default function CallSettingsModal({
  onClose,
  initialTab = 'general',
  viewMode = 'gallery',
  onViewModeChange,
  onToggleEffects,
  effects,
  cameras,
  mics,
  speakers,
  audioOutputDeviceId,
  onSelectSpeaker,
}: CallSettingsModalProps) {
  const room = useRoomContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [activeCameraId, setActiveCameraId] = useState<string>(() => room.getActiveDevice('videoinput') ?? '');
  const [activeMicId, setActiveMicId] = useState<string>(() => room.getActiveDevice('audioinput') ?? '');
  const [mirrorSelfView, setMirrorSelfView] = useState(true);
  const [hideNonVideo, setHideNonVideo] = useState(false);
  const [hideSelfView, setHideSelfView] = useState(false);
  const [showNamesOnVideo, setShowNamesOnVideo] = useState(true);
  const [alwaysShowControls, setAlwaysShowControls] = useState(true);
  const [showProfilePics, setShowProfilePics] = useState(true);
  const [animateEmojis, setAnimateEmojis] = useState(true);
  const [spacebarUnmute, setSpacebarUnmute] = useState(true);
  const [skinTone, setSkinTone] = useState('👍');
  const [audioMode, setAudioMode] = useState<'noise-removal' | 'isolation' | 'original'>('noise-removal');
  const [testingSpeaker, setTestingSpeaker] = useState(false);
  const [speakerVolume, setSpeakerVolume] = useState(100);
  const [micVolume, setMicVolume] = useState(100);

  const { localParticipant } = useLocalParticipant();
  const audioTrack = localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  const liveAudioLevel = useLiveAudioLevel(audioTrack ?? undefined);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  const handleTestSpeaker = () => {
    setTestingSpeaker(true);
    playTestSpeakerChime();
    setTimeout(() => setTestingSpeaker(false), 800);
  };

  // Live statistics state — derived from the real RTCStatsReport, never synthesized.
  const [stats, setStats] = useState<{
    connectionState: string;
    serverUrl: string;
    ping: number | null;
    participantsCount: number;
    audioCodec: string;
    videoCodec: string;
    bitrateKbps: number | null;
    packetLossPct: number | null;
  }>({
    connectionState: room.state,
    serverUrl: (room as any).serverUrl || 'LiveKit Cloud',
    ping: null,
    participantsCount: room.remoteParticipants.size + 1,
    audioCodec: '—',
    videoCodec: '—',
    bitrateKbps: null,
    packetLossPct: null,
  });

  useEffect(() => {
    let cancelled = false;
    const collect = async () => {
      try {
        const peer = (room as unknown as { engine?: { pcManager?: {
          publisher?: { getStats: () => Promise<RTCStatsReport> };
          subscriber?: { getStats: () => Promise<RTCStatsReport> };
        } } }).engine?.pcManager;
        const reports: RTCStatsReport[] = [];
        if (peer?.publisher) {
          try { reports.push(await peer.publisher.getStats()); } catch {}
        }
        if (peer?.subscriber) {
          try { reports.push(await peer.subscriber.getStats()); } catch {}
        }
        if (cancelled || reports.length === 0) return;
        let rttMs: number | null = null;
        let audioCodec = '—';
        let videoCodec = '—';
        let bytesNow = 0;
        let lostNow = 0;
        let packetsNow = 0;
        for (const report of reports) {
          report.forEach((s: RTCStats) => {
            const st = s as unknown as Record<string, unknown> & { type: string; id: string };
            if (st.type === 'candidate-pair' && (st as Record<string, unknown>).state === 'succeeded') {
              const rtt = (st as Record<string, unknown>).currentRoundTripTime;
              if (typeof rtt === 'number') rttMs = Math.round(rtt * 1000);
            }
            if (st.type === 'codec') {
              const mime = (st as Record<string, unknown>).mimeType;
              if (typeof mime === 'string') {
                const short = mime.replace('audio/', '').replace('video/', '').toUpperCase();
                if (mime.startsWith('audio/')) audioCodec = short;
                else if (mime.startsWith('video/')) videoCodec = short;
              }
            }
            if (st.type === 'inbound-rtp' || st.type === 'outbound-rtp') {
              const bytes = (st as Record<string, unknown>).bytesReceived ?? (st as Record<string, unknown>).bytesSent;
              if (typeof bytes === 'number') bytesNow += bytes;
              const lost = (st as Record<string, unknown>).packetsLost;
              if (typeof lost === 'number') lostNow += lost;
              const count = (st as Record<string, unknown>).packetsReceived ?? (st as Record<string, unknown>).packetsSent;
              if (typeof count === 'number') packetsNow += count;
            }
          });
        }
        setStats((prev) => {
          const elapsedSec = 3;
          const bitrateKbps = prev.bitrateKbps == null || bytesNow === 0
            ? (bytesNow > 0 ? 0 : null)
            : Math.max(0, Math.round(((bytesNow - (collect as { _bytes?: number })._bytes!) * 8) / 1000 / elapsedSec));
          (collect as { _bytes?: number })._bytes = bytesNow;
          const packetLossPct = packetsNow > 0 ? Math.round((lostNow / (lostNow + packetsNow)) * 1000) / 10 : null;
          return {
            connectionState: room.state,
            serverUrl: (room as any).serverUrl || 'LiveKit Cloud',
            ping: rttMs,
            participantsCount: room.remoteParticipants.size + 1,
            audioCodec,
            videoCodec,
            bitrateKbps,
            packetLossPct,
          };
        });
      } catch {}
    };
    collect();
    const timer = setInterval(collect, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [room]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: LayoutIcon },
    { id: 'video', label: 'Video', icon: CameraIcon },
    { id: 'audio', label: 'Audio', icon: MicIcon },
    { id: 'backgrounds', label: 'Backgrounds', icon: SparklesIcon },
    { id: 'statistics', label: 'Statistics', icon: StatsBarChartIcon },
    { id: 'about', label: 'About', icon: InfoIcon },
  ];

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[101] w-full sm:max-w-2xl rounded-t-[32px] sm:rounded-3xl shadow-2xl animate-fadeIn overflow-hidden flex flex-col"
        style={{
          background: 'rgba(24, 26, 32, 0.96)',
          backdropFilter: 'blur(36px) saturate(180%)',
          WebkitBackdropFilter: 'blur(36px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
          height: 'min(86vh, 620px)',
          maxHeight: 'calc(100dvh - 32px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <SettingsIcon className="w-5 h-5 text-white/80" />
            <h2 className="text-base font-bold text-white tracking-tight">Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Mobile Top Segmented Tabs */}
        <div className="sm:hidden flex items-center overflow-x-auto px-4 py-2 border-b border-white/10 shrink-0 gap-1.5 scrollbar-none">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  active
                    ? 'bg-[#0A84FF] text-white shadow-md'
                    : 'bg-white/5 text-white/70 hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Desktop Container: Left Rail + Content Area */}
        <div className="flex flex-1 min-h-0">
          {/* Desktop Left Rail */}
          <div className="hidden sm:flex flex-col w-44 border-r border-white/10 p-3 space-y-1 shrink-0 overflow-y-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer text-left ${
                    active
                      ? 'bg-[#0A84FF] text-white font-bold shadow-md shadow-blue-500/20'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Main Content Panel */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. GENERAL TAB */}
            {activeTab === 'general' && (
              <div className="space-y-5">
                {/* Meeting Controls Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alwaysShowControls}
                    onChange={(e) => setAlwaysShowControls(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-semibold text-white">Always show meeting controls</div>
                    <div className="text-[11px] text-white/50">Keep the bottom meeting toolbar visible during class</div>
                  </div>
                </label>

                {/* Chat Profile Pics Checkbox */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showProfilePics}
                    onChange={(e) => setShowProfilePics(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-semibold text-white">Show participant profile pictures next to their name in meeting chat</div>
                    <div className="text-[11px] text-white/50">Display profile avatars next to chat messages</div>
                  </div>
                </label>

                {/* Reaction Skin Tone */}
                <div className="pt-2 border-t border-white/10">
                  <div className="text-xs font-semibold text-white mb-2">Reaction Skin Tone</div>
                  <div className="flex items-center gap-2">
                    {['👍', '👍🏻', '👍🏼', '👍🏽', '👍🏾', '👍🏿'].map((tone) => (
                      <button
                        key={tone}
                        type="button"
                        onClick={() => setSkinTone(tone)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer ${
                          skinTone === tone
                            ? 'bg-[#0A84FF]/20 border-2 border-[#0A84FF] scale-110 shadow-md'
                            : 'bg-white/5 hover:bg-white/10 border border-white/10'
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Animate Emojis */}
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={animateEmojis}
                    onChange={(e) => setAnimateEmojis(e.target.checked)}
                    className="mt-0.5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-semibold text-white">Animate emojis</div>
                    <div className="text-[11px] text-white/50">Play smooth burst animation when reactions are triggered</div>
                  </div>
                </label>

                {/* Stage Layout Mode */}
                <div className="pt-2 border-t border-white/10">
                  <h3 className="text-xs font-semibold text-white mb-1">Stage Layout Mode</h3>
                  <p className="text-[11px] text-white/50 mb-3">Choose how video tiles are displayed during Quran recitation.</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'gallery', label: 'Gallery Grid', desc: 'Equal balanced grid' },
                      { id: 'speaker', label: 'Speaker View', desc: 'Teacher or Quran page fills stage' },
                      { id: 'active', label: 'Active Speaker', desc: 'Tracks reciting student' },
                    ].map((item) => {
                      const sel = viewMode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onViewModeChange?.(item.id as ViewMode)}
                          className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                            sel
                              ? 'bg-blue-600/20 border-[#0A84FF] text-white'
                              : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                          }`}
                        >
                          <div className="text-xs font-bold">{item.label}</div>
                          <div className="text-[10px] text-white/50 mt-0.5">{item.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 2. VIDEO TAB */}
            {activeTab === 'video' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">Camera</label>
                  <select
                    value={activeCameraId}
                    onChange={(e) => {
                      setActiveCameraId(e.target.value);
                      room.switchActiveDevice('videoinput', e.target.value).catch(() => {});
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl text-xs bg-white/5 text-white border border-white/15 focus:outline-none focus:border-blue-400 cursor-pointer"
                  >
                    {cameras.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-neutral-900 text-white">
                        {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Live Camera Preview Box */}
                <LiveCameraPreview deviceId={activeCameraId} mirror={mirrorSelfView} />

                <div className="space-y-2.5 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={mirrorSelfView}
                      onChange={(e) => setMirrorSelfView(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs text-white/90">Mirror my video</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideNonVideo}
                      onChange={(e) => setHideNonVideo(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs text-white/90">Hide Non-video Participants</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideSelfView}
                      onChange={(e) => setHideSelfView(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs text-white/90">Hide Self View</span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showNamesOnVideo}
                      onChange={(e) => setShowNamesOnVideo(e.target.checked)}
                      className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span className="text-xs text-white/90">Always show participant names on their videos</span>
                  </label>
                </div>
              </div>
            )}

            {/* 3. AUDIO TAB */}
            {activeTab === 'audio' && (
              <div className="space-y-5">
                {/* Speaker Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white">Speaker</label>
                    <button
                      type="button"
                      onClick={handleTestSpeaker}
                      className="px-3 py-1 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                    >
                      {testingSpeaker ? '🔊 Testing…' : 'Test Speaker'}
                    </button>
                  </div>
                  <select
                    value={audioOutputDeviceId ?? speakers[0]?.deviceId ?? ''}
                    onChange={(e) => {
                      onSelectSpeaker?.(e.target.value);
                      room.switchActiveDevice('audiooutput', e.target.value).catch(() => {});
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl text-xs bg-white/5 text-white border border-white/15 focus:outline-none focus:border-blue-400 cursor-pointer"
                  >
                    {speakers.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-neutral-900 text-white">
                        {d.label || `Speaker ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs text-white/50">Volume:</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={speakerVolume}
                      onChange={(e) => setSpeakerVolume(Number(e.target.value))}
                      className="flex-1 accent-[#0A84FF] h-1 bg-white/20 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs font-mono text-white/70 w-8">{speakerVolume}%</span>
                  </div>
                </div>

                {/* Microphone Section */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white">Microphone</label>
                    <span className="text-[11px] text-white/50">Active Input</span>
                  </div>
                  <select
                    value={activeMicId}
                    onChange={(e) => {
                      setActiveMicId(e.target.value);
                      room.switchActiveDevice('audioinput', e.target.value).catch(() => {});
                    }}
                    className="w-full px-3.5 py-2.5 rounded-2xl text-xs bg-white/5 text-white border border-white/15 focus:outline-none focus:border-blue-400 cursor-pointer"
                  >
                    {mics.map((d) => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-neutral-900 text-white">
                        {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-white/60">
                      <span>Input Level:</span>
                      <span className="text-blue-400 font-mono text-[10px]">Live Audio Pickup</span>
                    </div>
                    <SegmentedAudioMeter level={liveAudioLevel} />
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-xs text-white/50">Volume:</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={micVolume}
                      onChange={(e) => setMicVolume(Number(e.target.value))}
                      className="flex-1 accent-[#0A84FF] h-1 bg-white/20 rounded-lg cursor-pointer"
                    />
                    <span className="text-xs font-mono text-white/70 w-8">{micVolume}%</span>
                  </div>
                </div>

                {/* Audio Profile / Noise Suppression */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <div className="text-xs font-bold text-white">Microphone Modes & Noise Suppression</div>
                  <div className="space-y-1.5">
                    {[
                      { id: 'noise-removal', title: 'Noise removal (default)', desc: 'Blocks room background noise, fan hums, and echoes' },
                      { id: 'isolation', title: 'Personalized audio isolation', desc: 'Focuses entirely on the speaker voice' },
                      { id: 'original', title: 'Original sound for musicians', desc: 'Disables echo cancellation and noise suppression for high fidelity Quran tajweed' },
                    ].map((mode) => (
                      <label
                        key={mode.id}
                        className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition ${
                          audioMode === mode.id
                            ? 'bg-[#0A84FF]/15 border-[#0A84FF] text-white'
                            : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        <input
                          type="radio"
                          name="audioMode"
                          checked={audioMode === mode.id}
                          onChange={() => setAudioMode(mode.id as any)}
                          className="mt-0.5 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-semibold text-white">{mode.title}</div>
                          <div className="text-[10px] text-white/50">{mode.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Spacebar to Unmute */}
                <label className="flex items-center gap-3 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={spacebarUnmute}
                    onChange={(e) => setSpacebarUnmute(e.target.checked)}
                    className="rounded border-white/20 bg-white/10 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-xs text-white/90">Press and hold SPACE key to temporarily unmute</span>
                </label>
              </div>
            )}

            {/* 4. BACKGROUNDS TAB */}
            {activeTab === 'backgrounds' && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Virtual Backgrounds & Blur</h3>
                <p className="text-xs text-white/50">
                  Select background blur or spiritual mosque and classroom backdrops for privacy during Quran lessons.
                </p>
                {/* The same live swatch grid as the in-call drawer, driven by the
                    call's effects hook — works standalone, no drawer needed. */}
                {effects ? (
                  <div className="-mx-3">
                    <BackgroundEffectsContent effects={effects} />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onToggleEffects?.();
                    }}
                    className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-[#0A84FF] hover:bg-blue-500 text-white cursor-pointer transition shadow-md"
                  >
                    ✨ Open Background Effects Drawer
                  </button>
                )}
              </div>
            )}

            {/* 5. STATISTICS TAB */}
            {activeTab === 'statistics' && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Connection Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">State</div>
                    <div className="text-sm font-bold text-emerald-400 capitalize">{stats.connectionState}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">Ping / Latency</div>
                    <div className="text-sm font-bold text-white">{stats.ping == null ? 'Measuring…' : `${stats.ping} ms`}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">Room Participants</div>
                    <div className="text-sm font-bold text-white">{stats.participantsCount}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">Audio Codec</div>
                    <div className="text-sm font-bold text-white">{stats.audioCodec}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">Video Codec</div>
                    <div className="text-sm font-bold text-white">{stats.videoCodec}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">Bitrate</div>
                    <div className="text-sm font-bold text-white">{stats.bitrateKbps == null ? 'Measuring…' : `${stats.bitrateKbps} kbps`}</div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                    <div className="text-[11px] text-white/50">Packet Loss</div>
                    <div className="text-sm font-bold text-white">{stats.packetLossPct == null ? 'Measuring…' : `${stats.packetLossPct}%`}</div>
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
                  <div className="text-[11px] text-white/50">LiveKit Server</div>
                  <div className="text-xs font-mono text-white/80 truncate mt-0.5">{stats.serverUrl}</div>
                </div>
              </div>
            )}

            {/* 6. ABOUT TAB */}
            {activeTab === 'about' && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Zoom Workplace for Quran LMS</h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  Version 2.0.0-parity. Built with Next.js 15, LiveKit Cloud WebRTC, and Apple Liquid Glass design.
                  Designed for secure 1-on-1 and group Quranic education.
                </p>
                <div className="pt-2 flex items-center gap-4 text-xs font-medium text-blue-400">
                  <a href="/privacy" target="_blank" rel="noreferrer" className="hover:underline">
                    Privacy Policy
                  </a>
                  <span>•</span>
                  <a href="/terms" target="_blank" rel="noreferrer" className="hover:underline">
                    Terms of Service
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
