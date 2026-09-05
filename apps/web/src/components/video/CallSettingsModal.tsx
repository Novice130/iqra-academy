'use client';

/**
 * Call Settings Modal — Apple / Zoom style settings dialog:
 * - Desktop: Left category rail
 * - Mobile: Segmented top tabs
 * - Categories: General, Audio, Video, Backgrounds, Statistics, About
 */

import React, { useState, useEffect, useRef } from 'react';
import { Track } from 'livekit-client';
import { useRoomContext, useLocalParticipant } from '@livekit/components-react';
import {
  SettingsIcon,
  MicIcon,
  CameraIcon,
  SparklesIcon,
  LayoutIcon,
  InfoIcon,
} from './CallIcons';
import type { ViewMode } from './CallControlBar';

type SettingsTab = 'general' | 'audio' | 'video' | 'backgrounds' | 'statistics' | 'about';

interface CallSettingsModalProps {
  onClose: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  onToggleEffects?: () => void;
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  audioOutputDeviceId?: string;
  onSelectSpeaker?: (id: string) => void;
}

function LiveMicBar() {
  const { localParticipant } = useLocalParticipant();
  const audioTrack = localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack;
  const level = useLiveAudioLevel(audioTrack ?? undefined);
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return (
    <div
      className="w-full h-2 rounded-full bg-black/40 overflow-hidden"
      role="meter"
      aria-label="Microphone input level"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full bg-emerald-400 transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
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

export default function CallSettingsModal({
  onClose,
  viewMode = 'gallery',
  onViewModeChange,
  onToggleEffects,
  cameras,
  mics,
  speakers,
  audioOutputDeviceId,
  onSelectSpeaker,
}: CallSettingsModalProps) {
  const room = useRoomContext();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [activeCameraId, setActiveCameraId] = useState<string>(() => room.getActiveDevice('videoinput') ?? '');
  const [activeMicId, setActiveMicId] = useState<string>(() => room.getActiveDevice('audioinput') ?? '');
  const [mirrorSelfView, setMirrorSelfView] = useState(true);

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

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General', icon: LayoutIcon },
    { id: 'audio', label: 'Audio', icon: MicIcon },
    { id: 'video', label: 'Video', icon: CameraIcon },
    { id: 'backgrounds', label: 'Backgrounds', icon: SparklesIcon },
    { id: 'statistics', label: 'Statistics', icon: SettingsIcon },
    { id: 'about', label: 'About', icon: InfoIcon },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      <div
        className="fixed left-1/2 -translate-x-1/2 bottom-0 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-[81] w-full sm:max-w-2xl rounded-t-[32px] sm:rounded-3xl shadow-2xl animate-fadeIn overflow-hidden flex flex-col"
        style={{
          background: 'rgba(24, 26, 32, 0.96)',
          backdropFilter: 'blur(36px) saturate(180%)',
          WebkitBackdropFilter: 'blur(36px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
          height: 'min(82vh, 580px)',
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
                    ? 'bg-blue-600 text-white shadow-md'
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
          <div className="hidden sm:flex flex-col w-48 border-r border-white/10 p-3 space-y-1 shrink-0">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition cursor-pointer text-left ${
                    active
                      ? 'bg-white/15 text-white font-bold shadow-inner'
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
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Stage Layout Mode</h3>
                  <p className="text-xs text-white/50 mb-3">Choose how video tiles are displayed during Quran recitation.</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { id: 'gallery', label: 'Gallery Grid', desc: 'Equal balanced grid' },
                      { id: 'speaker', label: 'Speaker View', desc: 'Teacher or Quran page fills stage' },
                      { id: 'active', label: 'Active Speaker', desc: 'Tracks active reciting student' },
                    ].map((item) => {
                      const sel = viewMode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onViewModeChange?.(item.id as ViewMode)}
                          className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                            sel
                              ? 'bg-blue-600/20 border-blue-500/80 text-white'
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

                <div className="pt-3 border-t border-white/10">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white">Mirror Self Video</div>
                      <div className="text-[11px] text-white/50">Mirror your camera preview locally</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMirrorSelfView((v) => !v)}
                      className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer flex items-center ${
                        mirrorSelfView ? 'bg-blue-600 justify-end' : 'bg-white/20 justify-start'
                      }`}
                    >
                      <span className="w-5 h-5 rounded-full bg-white shadow-md" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'audio' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">Microphone</label>
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
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">Speaker / Audio Output</label>
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
                </div>

                <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                  <div className="text-[11px] text-white/50">Microphone Test Meter</div>
                  <LiveMicBar />
                  <p className="text-[10px] text-white/40">Speak into your microphone to verify audio pickup.</p>
                </div>
              </div>
            )}

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

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center space-y-2">
                  <div className="text-xs font-bold text-white">HD Video Optimized</div>
                  <p className="text-[11px] text-white/50">
                    LiveKit WebRTC utilizes adaptive resolution and simulcast to maintain stable crystal-clear video.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'backgrounds' && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Virtual Backgrounds & Blur</h3>
                <p className="text-xs text-white/50">
                  Select background blur or spiritual mosque and classroom backdrops for privacy during lessons.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onToggleEffects?.();
                  }}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer transition shadow-md"
                >
                  ✨ Open Background Effects Drawer
                </button>
              </div>
            )}

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

            {activeTab === 'about' && (
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white">Novice Tutor Classroom</h3>
                <p className="text-xs text-white/60 leading-relaxed">
                  Version 2.0.0-parity. Built with Next.js 15, LiveKit Cloud WebRTC, and Drizzle ORM.
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
    </>
  );
}
