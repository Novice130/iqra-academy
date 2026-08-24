'use client';

/**
 * CustomVideoConference — Apple iOS 17/18 FaceTime stage layout:
 * - Full-bleed presentation stage & auto-balanced responsive grid
 * - Free draggable PIP tiles with slot-snapping and squircle continuous corners
 * - Floating Dynamic Island notification pills
 * - Distraction-free focus mode: auto-hide chrome on tap for Quran recitation
 * - 100% feature retention across audio unlock, per-student volume, backgrounds, moderation
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import { isTrackReference, type TrackReferenceOrPlaceholder, type WidgetState } from '@livekit/components-core';
import {
  Chat,
  RoomAudioRenderer,
  ConnectionStateToast,
  useTracks,
  useRoomContext,
  useSpeakingParticipants,
  useRemoteParticipants,
  LayoutContextProvider,
  useCreateLayoutContext,
} from '@livekit/components-react';
import CallControlBar, { type ViewMode, VIEW_MODES } from './CallControlBar';
import { LayoutIcon, ChevronUpIcon, EffectsIcon } from './CallIcons';
import PeoplePanel, { MediaRequestModal } from './PeoplePanel';
import VideoTile, { type TileActions } from './VideoTile';
import GuestKnockPrompt from './GuestKnockPrompt';
import ScreenSharePill from './ScreenSharePill';
import SoloInactivityPrompt from './SoloInactivityPrompt';
import { useBackgroundEffects, BackgroundEffectsContent, type EffectSelection } from './BackgroundEffects';
import { useCycleCamera, useHasMultipleCameras } from './cameraDevices';
import { useHostControls } from './hostControls';
import { gainForSlider } from '@/lib/audio-gain';

function useLiveRoomMetadata(): string | undefined {
  const room = useRoomContext();
  const [metadata, setMetadata] = useState<string | undefined>(room.metadata);

  useEffect(() => {
    const handler = () => setMetadata(room.metadata);
    handler();
    room.on(RoomEvent.RoomMetadataChanged, handler);
    room.on(RoomEvent.Connected, handler);
    return () => {
      room.off(RoomEvent.RoomMetadataChanged, handler);
      room.off(RoomEvent.Connected, handler);
    };
  }, [room]);

  return metadata;
}

interface CustomVideoConferenceProps {
  isModerator: boolean;
  isHost: boolean;
  onEndClassIntent: () => void;
  sessionId: string;
  teacherIdentity: string | null;
  initialEffect?: EffectSelection;
}

function baseIdentity(identity: string | null | undefined): string | null {
  if (!identity) return null;
  return identity.split('#')[0];
}

function useTeacherAway(teacherIdentity: string | null, enabled: boolean): boolean {
  const remotes = useRemoteParticipants();
  const teacherBase = baseIdentity(teacherIdentity);
  const present =
    !enabled ||
    !teacherBase ||
    remotes.some((p) => baseIdentity(p.identity) === teacherBase);

  const [away, setAway] = useState(false);
  useEffect(() => {
    if (present) {
      setAway(false);
      return;
    }
    const timer = setTimeout(() => setAway(true), 5000);
    return () => clearTimeout(timer);
  }, [present]);

  return away;
}

function parseSpotlightIdentity(metadata: string | undefined): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata);
    return typeof parsed.spotlightIdentity === 'string' ? parsed.spotlightIdentity : null;
  } catch {
    return null;
  }
}

function parseVolumes(metadata: string | undefined): Record<string, number> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata);
    const volumes = parsed?.volumes;
    if (!volumes || typeof volumes !== 'object') return {};
    const clean: Record<string, number> = {};
    for (const [identity, value] of Object.entries(volumes)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        clean[identity] = Math.min(1, Math.max(0, value));
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function useAppliedVolumes(volumes: Record<string, number>) {
  const room = useRoomContext();

  useEffect(() => {
    const apply = () => {
      room.remoteParticipants.forEach((participant) => {
        const base = baseIdentity(participant.identity);
        const gain = gainForSlider(base ? volumes[base] ?? 1 : 1);
        participant.setVolume(gain);
        participant.setVolume(gain, Track.Source.ScreenShareAudio);
      });
    };
    apply();
    room.on(RoomEvent.ParticipantConnected, apply);
    room.on(RoomEvent.TrackSubscribed, apply);
    return () => {
      room.off(RoomEvent.ParticipantConnected, apply);
      room.off(RoomEvent.TrackSubscribed, apply);
    };
  }, [room, volumes]);
}

function useAudioPlaybackUnlock() {
  const room = useRoomContext();

  useEffect(() => {
    let armed: (() => void) | null = null;

    const disarm = () => {
      if (!armed) return;
      window.removeEventListener('pointerdown', armed);
      armed = null;
    };

    const check = () => {
      if (room.canPlaybackAudio) {
        disarm();
        return;
      }
      if (armed) return;
      armed = () => {
        room.startAudio().catch(() => {});
        disarm();
      };
      window.addEventListener('pointerdown', armed);
    };

    check();
    room.on(RoomEvent.AudioPlaybackStatusChanged, check);
    return () => {
      room.off(RoomEvent.AudioPlaybackStatusChanged, check);
      disarm();
    };
  }, [room]);
}

function useViewportOrientation(): 'portrait' | 'landscape' {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches
      ? 'portrait'
      : 'landscape'
  );

  useEffect(() => {
    const mql = window.matchMedia('(orientation: portrait)');
    const handler = () => setOrientation(mql.matches ? 'portrait' : 'landscape');
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return orientation;
}

const FLOAT_GAP = 12;
const FLOAT_MARGIN = 14;

interface Slot {
  left: number;
  top: number;
}

function computeSlots(
  container: { width: number; height: number },
  box: { width: number; height: number },
  count: number
): Slot[] {
  if (count === 0 || container.width === 0 || container.height === 0) return [];

  const usableHeight = container.height - FLOAT_MARGIN * 2;
  const perColumn = Math.max(1, Math.floor((usableHeight + FLOAT_GAP) / (box.height + FLOAT_GAP)));

  return Array.from({ length: count }, (_, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    const left = container.width - FLOAT_MARGIN - (col + 1) * box.width - col * FLOAT_GAP;
    const top = container.height - FLOAT_MARGIN - (row + 1) * box.height - row * FLOAT_GAP;
    return {
      left: Math.max(FLOAT_MARGIN, left),
      top: Math.max(FLOAT_MARGIN, top),
    };
  });
}

function DraggableTile({
  slot,
  size,
  onTap,
  onDropAt,
  children,
}: {
  slot: Slot;
  size: { width: number; height: number };
  onTap?: () => void;
  onDropAt?: (point: { left: number; top: number }) => void;
  children: React.ReactNode;
}) {
  const [drag, setDrag] = useState<{ left: number; top: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    dragging: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startedAt: 0,
    moved: 0,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = elRef.current;
    if (!el) return;
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: slot.left,
      startTop: slot.top,
      startedAt: Date.now(),
      moved: 0,
    };
    setDrag({ left: slot.left, top: slot.top });
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    dragState.current.moved = Math.max(dragState.current.moved, Math.abs(dx) + Math.abs(dy));
    setDrag({ left: dragState.current.startLeft + dx, top: dragState.current.startTop + dy });
  };

  const onPointerUp = () => {
    const { dragging, moved, startedAt } = dragState.current;
    dragState.current.dragging = false;
    const dropped = drag;
    setDrag(null);
    if (!dragging) return;

    if (onTap && moved < 8 && Date.now() - startedAt < 500) {
      onTap();
      return;
    }
    if (dropped && moved >= 8) onDropAt?.(dropped);
  };

  const position = drag ?? slot;

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute z-30 rounded-2xl sm:rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
      style={{
        width: size.width,
        height: size.height,
        left: position.left,
        top: position.top,
        transition: drag ? 'none' : 'left 180ms cubic-bezier(0.16, 1, 0.3, 1), top 180ms cubic-bezier(0.16, 1, 0.3, 1)',
        border: '1.5px solid rgba(255, 255, 255, 0.22)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  );
}

function columnsFor(count: number) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export default function CustomVideoConference({
  isModerator,
  isHost,
  onEndClassIntent,
  sessionId,
  teacherIdentity,
  initialEffect,
}: CustomVideoConferenceProps) {
  const layoutContext = useCreateLayoutContext();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const metadata = useLiveRoomMetadata();
  const { muteTrack, askToUnmute, askForCamera, rename, removeParticipant } = useHostControls(sessionId);

  const [pendingSpotlight, setPendingSpotlight] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPendingSpotlight(undefined);
  }, [metadata]);
  const roomSpotlight = pendingSpotlight !== undefined ? pendingSpotlight : parseSpotlightIdentity(metadata);

  const volumes = useMemo(() => parseVolumes(metadata), [metadata]);
  useAppliedVolumes(volumes);
  useAudioPlaybackUnlock();

  const setVolume = useCallback(
    (base: string, volume: number) => {
      fetch(`/api/sessions/${sessionId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: base, volume }),
      }).catch(() => {});
    },
    [sessionId]
  );

  const focusIdentity = baseIdentity(roomSpotlight) ?? baseIdentity(teacherIdentity);
  const [viewMode, setViewMode] = useState<ViewMode>(isModerator ? 'gallery' : 'speaker');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);

  const speakers = useSpeakingParticipants();
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  useEffect(() => {
    const speaking = speakers.find((p) => !p.isLocal) ?? speakers[0];
    if (speaking) setLastSpeaker(speaking.identity);
  }, [speakers]);

  const [widgetState, setWidgetState] = useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });

  const teacherAway = useTeacherAway(teacherIdentity, !isModerator);
  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();
  const effects = useBackgroundEffects(initialEffect);
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const tapStartTimeRef = useRef(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = useCallback(() => {
    setChromeHidden(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (viewMenuOpen || peopleOpen || widgetState.showChat || effectsOpen) return;
    idleTimerRef.current = setTimeout(() => {
      setChromeHidden(true);
    }, 3500);
  }, [viewMenuOpen, peopleOpen, widgetState.showChat, effectsOpen]);

  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStageSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const orientation = useViewportOrientation();
  const floatBox =
    orientation === 'portrait' ? { width: 116, height: 184 } : { width: 184, height: 116 };

  const [slotOrder, setSlotOrder] = useState<string[]>([]);

  const handleSpotlight = useCallback(
    (identity: string | null) => {
      setPendingSpotlight(identity);
      fetch(`/api/sessions/${sessionId}/spotlight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity }),
      })
        .then((res) => {
          if (!res.ok) {
            console.error('Spotlight update failed', res.status);
            setPendingSpotlight(undefined);
          }
        })
        .catch(() => setPendingSpotlight(undefined));
    },
    [sessionId]
  );

  const cameraTracks = tracks.filter((t) => t.source === Track.Source.Camera);
  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && t.publication?.isSubscribed
  );

  const describe = (t: TrackReferenceOrPlaceholder) => {
    const identity = t.participant.identity;
    const mic = micTracks.find((m) => m.participant.identity === identity);
    return {
      trackRef: t,
      key: `${identity}-${t.source}`,
      identity,
      base: baseIdentity(identity)!,
      name: t.participant.name || baseIdentity(identity) || 'Participant',
      isLocal: t.participant.isLocal,
      micMuted: mic?.publication?.isMuted ?? true,
      micSid: mic?.publication?.trackSid,
      cameraOff: !isTrackReference(t) || !!t.publication?.isMuted,
      cameraSid: t.publication?.trackSid,
    };
  };

  type Described = ReturnType<typeof describe>;

  const actionsFor = (p: Described): TileActions | undefined => {
    if (!isModerator || p.isLocal) return undefined;
    return {
      onSpotlight: () => handleSpotlight(p.base === focusIdentity ? null : p.base),
      onMute: p.micSid && !p.micMuted ? () => muteTrack(p.identity, p.micSid!) : undefined,
      onAskToUnmute: p.micMuted ? () => askToUnmute(p.identity) : undefined,
      onCameraOff: p.cameraSid && !p.cameraOff ? () => muteTrack(p.identity, p.cameraSid!) : undefined,
      onAskForCamera: p.cameraOff ? () => askForCamera(p.identity) : undefined,
      onRename: (name: string) => rename(p.identity, name),
      onRemove: () => removeParticipant(p.identity),
      volume: volumes[p.base] ?? 1,
      onVolume: (volume: number) => setVolume(p.base, volume),
    };
  };

  const renderTile = (p: Described, fit: 'cover' | 'contain' = 'contain') => (
    <VideoTile
      trackRef={p.trackRef}
      name={p.name}
      micMuted={p.micMuted}
      cameraOff={p.cameraOff}
      isLocal={p.isLocal}
      isSpotlighted={p.base === focusIdentity && p.base !== baseIdentity(teacherIdentity)}
      actions={actionsFor(p)}
      fit={fit}
    />
  );

  const all = cameraTracks.map(describe);
  const localCamera = all.find((p) => p.isLocal);
  const others = all.filter((p) => !p.isLocal);

  let focused: Described | undefined;
  let gridTiles: Described[] = all;
  let floating: Described[] = [];

  if (screenShareTrack) {
    focused = describe(screenShareTrack);
    floating = all;
    gridTiles = [];
  } else if (viewMode === 'gallery') {
    if (isModerator && others.length > 0) {
      gridTiles = others;
      floating = localCamera ? [localCamera] : [];
    }
  } else {
    const focusTarget =
      viewMode === 'active'
        ? all.find((p) => p.identity === lastSpeaker) ?? all.find((p) => p.base === focusIdentity)
        : all.find((p) => p.base === focusIdentity);
    if (focusTarget) {
      focused = focusTarget;
      gridTiles = [];
      floating = all.filter((p) => p.key !== focusTarget.key);
    }
  }

  const floatingKeys = floating.map((p) => p.key);
  const orderedKeys = [
    ...slotOrder.filter((k) => floatingKeys.includes(k)),
    ...floatingKeys.filter((k) => !slotOrder.includes(k)),
  ];
  useEffect(() => {
    setSlotOrder((prev) => {
      const next = [
        ...prev.filter((k) => floatingKeys.includes(k)),
        ...floatingKeys.filter((k) => !prev.includes(k)),
      ];
      return next.length === prev.length && next.every((k, i) => k === prev[i]) ? prev : next;
    });
  }, [floatingKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = computeSlots(stageSize, floatBox, orderedKeys.length);

  const handleDrop = (key: string, point: { left: number; top: number }) => {
    if (slots.length === 0) return;
    let nearest = 0;
    let best = Infinity;
    slots.forEach((s, i) => {
      const distance = Math.hypot(s.left - point.left, s.top - point.top);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setSlotOrder((prev) => {
      const order = [
        ...prev.filter((k) => floatingKeys.includes(k)),
        ...floatingKeys.filter((k) => !prev.includes(k)),
      ];
      const from = order.indexOf(key);
      if (from === -1 || from === nearest) return prev;
      const next = [...order];
      [next[from], next[nearest]] = [next[nearest], next[from]];
      return next;
    });
  };

  const handleStagePointerDown = () => {
    tapStartTimeRef.current = Date.now();
  };

  const handleStagePointerUp = (e: React.PointerEvent) => {
    if (Date.now() - tapStartTimeRef.current < 300) {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('input') ||
        target.closest('.call-control-bar') ||
        target.closest('[role="dialog"]')
      ) {
        return;
      }
      setChromeHidden((prev) => {
        const next = !prev;
        if (!next) resetIdleTimer();
        return next;
      });
    }
  };

  return (
    <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
      <div
        className="lk-video-conference call-surface bg-neutral-950 select-none"
        style={{ height: '100%' }}
        onPointerMove={resetIdleTimer}
        onPointerDown={handleStagePointerDown}
        onPointerUp={handleStagePointerUp}
      >
        <div className="lk-video-conference-inner" style={{ height: '100%', position: 'relative' }}>
          <div
            ref={stageRef}
            style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', overflow: 'hidden' }}
          >
            {focused ? (
              <div className="w-full h-full p-2 sm:p-3">{renderTile(focused)}</div>
            ) : (
              <div
                className="w-full h-full grid gap-2 sm:gap-3 p-2 sm:p-3"
                style={{
                  gridTemplateColumns: `repeat(${columnsFor(gridTiles.length)}, minmax(0, 1fr))`,
                  gridAutoRows: 'minmax(0, 1fr)',
                }}
              >
                {gridTiles.map((p) => (
                  <div key={p.key} className="min-w-0 min-h-0">
                    {renderTile(p)}
                  </div>
                ))}
              </div>
            )}

            {floating.map((p) => {
              const slot = slots[orderedKeys.indexOf(p.key)];
              if (!slot) return null;
              return (
                <DraggableTile
                  key={p.key}
                  slot={slot}
                  size={floatBox}
                  onTap={hasMultipleCameras && p.isLocal ? cycleCamera : undefined}
                  onDropAt={(point) => handleDrop(p.key, point)}
                >
                  {renderTile(p, 'cover')}
                </DraggableTile>
              );
            })}

            <div
              className={`absolute top-5 right-5 sm:top-6 sm:right-6 md:top-8 md:right-8 z-[60] pointer-events-auto transition-all duration-300 ${
                chromeHidden ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
              }`}
              style={{
                marginTop: 'max(0px, env(safe-area-inset-top))',
                marginRight: 'max(0px, env(safe-area-inset-right))',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMenuOpen((v) => !v);
                }}
                title="Switch layout"
                aria-label="Switch layout"
                className="flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full cursor-pointer transition-all duration-200 active:scale-95 text-white font-semibold text-xs shadow-2xl hover:brightness-110"
                style={{
                  background: 'rgba(24, 26, 34, 0.60)',
                  backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  border: '1px solid rgba(255, 255, 255, 0.20)',
                  boxShadow:
                    '0 12px 36px rgba(0, 0, 0, 0.40), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                }}
              >
                <LayoutIcon className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="capitalize text-xs font-semibold tracking-tight">
                  {viewMode === 'gallery' ? 'Gallery View' : viewMode === 'speaker' ? 'Speaker View' : 'Active Speaker'}
                </span>
                <ChevronUpIcon className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${viewMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {viewMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[80]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMenuOpen(false);
                    }}
                  />
                  <div
                    className="absolute right-0 top-12 z-[81] w-56 rounded-2xl p-1.5 shadow-2xl animate-fadeIn overflow-hidden"
                    style={{
                      background: 'rgba(24, 26, 34, 0.78)',
                      backdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
                      WebkitBackdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
                      border: '1px solid rgba(255, 255, 255, 0.20)',
                      boxShadow:
                        '0 20px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/45">
                      Choose Layout
                    </div>
                    <div className="space-y-0.5">
                      {VIEW_MODES.map((m) => {
                        const selected = viewMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewMode(m.id);
                              setViewMenuOpen(false);
                            }}
                            className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left cursor-pointer transition-all duration-150"
                            style={{
                              background: selected ? 'rgba(0, 122, 255, 0.35)' : 'transparent',
                            }}
                          >
                            <div>
                              <div
                                className="text-xs font-semibold"
                                style={{ color: selected ? '#93c5fd' : '#f3f4f6' }}
                              >
                                {m.label}
                              </div>
                              <div className="text-[10px] text-white/45">{m.hint}</div>
                            </div>
                            {selected && <span className="text-blue-400 font-bold text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Floating Center Visual Effects Button (Icon Only — Apple Liquid Glass) */}
            <div
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[55] pointer-events-auto transition-all duration-300 ${
                chromeHidden ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEffectsOpen((v) => !v);
                }}
                title="Change background / visual effects"
                aria-label="Change background / visual effects"
                className="group w-12 h-12 sm:w-13 sm:h-13 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 text-white shadow-2xl hover:brightness-110"
                style={{
                  background: effects.active
                    ? 'linear-gradient(135deg, rgba(0, 122, 255, 0.42) 0%, rgba(0, 90, 220, 0.30) 100%)'
                    : 'rgba(255, 255, 255, 0.12)',
                  backdropFilter: 'blur(28px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(28px) saturate(200%) contrast(105%)',
                  border: effects.active
                    ? '1px solid rgba(120, 190, 255, 0.55)'
                    : '1px solid rgba(255, 255, 255, 0.25)',
                  boxShadow: effects.active
                    ? '0 12px 36px rgba(0, 122, 255, 0.40), inset 0 1px 0 0 rgba(255, 255, 255, 0.70), inset 0 -1px 0 0 rgba(0, 122, 255, 0.25)'
                    : '0 10px 30px rgba(0, 0, 0, 0.35), inset 0 1px 0 0 rgba(255, 255, 255, 0.50), inset 0 -1px 0 0 rgba(255, 255, 255, 0.10)',
                }}
              >
                <EffectsIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white shrink-0 group-hover:scale-110 transition-transform" />
              </button>
            </div>

            {effectsOpen && (
              <>
                <div
                  className="fixed inset-0 z-[80]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEffectsOpen(false);
                  }}
                />
                <div
                  className="fixed left-1/2 -translate-x-1/2 bottom-[96px] z-[81] rounded-3xl overflow-y-auto"
                  style={{
                    background: 'rgba(24, 26, 34, 0.78)',
                    backdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
                    WebkitBackdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
                    border: '1px solid rgba(255, 255, 255, 0.20)',
                    boxShadow:
                      '0 24px 64px rgba(0, 0, 0, 0.55), inset 0 1px 0 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                    width: 'min(94vw, 560px)',
                    maxHeight: '62vh',
                  }}
                >
                  <BackgroundEffectsContent
                    effects={effects}
                    onSelect={() => setEffectsOpen(false)}
                    onClose={() => setEffectsOpen(false)}
                  />
                </div>
              </>
            )}
          </div>

          <div
            className={`transition-all duration-300 ${
              chromeHidden ? 'opacity-0 -translate-y-4 pointer-events-none' : 'opacity-100 translate-y-0'
            }`}
          >
            <ScreenSharePill />

            {/* Teacher disconnected Dynamic Island notification pill */}
            {teacherAway && (
              <div
                className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-4 py-2 rounded-full pointer-events-none shadow-2xl backdrop-blur-2xl"
                style={{
                  background: 'rgba(24, 26, 32, 0.88)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                <span className="text-xs font-semibold text-white tracking-tight">
                  Teacher disconnected · waiting to rejoin
                </span>
              </div>
            )}

            {(isModerator || isHost) && <GuestKnockPrompt sessionId={sessionId} />}
          </div>

          <SoloInactivityPrompt isHost={isHost} onLeaveOrEnd={onEndClassIntent} />

          <MediaRequestModal />

          {/* Floating Control Bar with auto-hide transition */}
          <div
            className={`transition-all duration-300 ${
              chromeHidden ? 'opacity-0 translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'
            }`}
          >
            <CallControlBar
              isHost={isHost}
              onEndClassIntent={onEndClassIntent}
              unreadMessages={widgetState.unreadMessages}
              chatOpen={widgetState.showChat}
              peopleOpen={peopleOpen}
              onToggleChat={() => layoutContext.widget.dispatch?.({ msg: 'toggle_chat' })}
              onTogglePeople={() => setPeopleOpen((v) => !v)}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>

        <Chat style={{ display: widgetState.showChat ? 'grid' : 'none' }} />

        {peopleOpen && (
          <PeoplePanel
            sessionId={sessionId}
            isModerator={isModerator}
            spotlightIdentity={focusIdentity}
            onSpotlight={handleSpotlight}
            volumes={volumes}
            onVolume={setVolume}
            onClose={() => setPeopleOpen(false)}
          />
        )}
      </div>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LayoutContextProvider>
  );
}
