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
import { LayoutIcon, ChevronUpIcon, EffectsIcon, FramePersonIcon, VisualEffectsSparkleIcon, MoreIcon } from './CallIcons';
import PeoplePanel, { MediaRequestModal } from './PeoplePanel';
import VideoTile, { type TileActions } from './VideoTile';
import GuestKnockPrompt from './GuestKnockPrompt';
import ScreenSharePill from './ScreenSharePill';
import SoloInactivityPrompt from './SoloInactivityPrompt';
import { useBackgroundEffects, BackgroundEffectsContent, type EffectSelection } from './BackgroundEffects';
import { useCycleCamera, useHasMultipleCameras } from './cameraDevices';
import { useHostControls } from './hostControls';
import { gainForSlider } from '@/lib/audio-gain';
import { copyTextToClipboard, shareOrCopy } from '@/lib/clipboard';

function useLiveRoomMetadata(): string | undefined {
  const room = useRoomContext();
  const [metadata, setMetadata] = useState<string | undefined>(() => room?.metadata);

  useEffect(() => {
    if (!room) return;
    const handler = () => {
      try {
        setMetadata(room.metadata);
      } catch {}
    };
    handler();
    try {
      room.on(RoomEvent.RoomMetadataChanged, handler);
      room.on(RoomEvent.Connected, handler);
    } catch {}
    return () => {
      try {
        room.off(RoomEvent.RoomMetadataChanged, handler);
        room.off(RoomEvent.Connected, handler);
      } catch {}
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
  teacherName?: string | null;
  joinCode?: string | null;
  sessionTitle?: string | null;
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
    if (!room) return;
    const apply = () => {
      try {
        if (!room || !room.remoteParticipants) return;
        room.remoteParticipants.forEach((participant) => {
          if (!participant) return;
          const base = baseIdentity(participant.identity);
          const gain = gainForSlider(base ? volumes[base] ?? 1 : 1);
          participant.setVolume(gain);
          participant.setVolume(gain, Track.Source.ScreenShareAudio);
        });
      } catch {}
    };
    apply();
    try {
      room.on(RoomEvent.ParticipantConnected, apply);
      room.on(RoomEvent.TrackSubscribed, apply);
    } catch {}
    return () => {
      try {
        room.off(RoomEvent.ParticipantConnected, apply);
        room.off(RoomEvent.TrackSubscribed, apply);
      } catch {}
    };
  }, [room, volumes]);
}

function useAudioPlaybackUnlock() {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;
    let armed: (() => void) | null = null;

    const disarm = () => {
      if (!armed) return;
      window.removeEventListener('pointerdown', armed);
      armed = null;
    };

    const check = () => {
      try {
        if (!room || room.canPlaybackAudio) {
          disarm();
          return;
        }
        if (armed) return;
        armed = () => {
          room.startAudio().catch(() => {});
          disarm();
        };
        window.addEventListener('pointerdown', armed);
      } catch {
        disarm();
      }
    };

    check();
    try {
      room.on(RoomEvent.AudioPlaybackStatusChanged, check);
    } catch {}
    return () => {
      try {
        room.off(RoomEvent.AudioPlaybackStatusChanged, check);
      } catch {}
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
  count: number,
  bottomClearance: number = 96
): Slot[] {
  if (count === 0 || container.width === 0 || container.height === 0) return [];

  const usableHeight = Math.max(box.height, container.height - bottomClearance - FLOAT_MARGIN * 2);
  const perColumn = Math.max(1, Math.floor((usableHeight + FLOAT_GAP) / (box.height + FLOAT_GAP)));

  return Array.from({ length: count }, (_, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    const left = container.width - FLOAT_MARGIN - (col + 1) * box.width - col * FLOAT_GAP;
    const top = container.height - bottomClearance - (row + 1) * box.height - row * FLOAT_GAP;
    return {
      left: Math.max(FLOAT_MARGIN, left),
      top: Math.max(FLOAT_MARGIN, top),
    };
  });
}

function snapPoint(
  raw: { left: number; top: number },
  size: { width: number; height: number },
  container: { width: number; height: number },
  bottomClearance: number,
  otherPositions: Slot[] = []
): { left: number; top: number } {
  const minX = FLOAT_MARGIN;
  const maxX = Math.max(minX, container.width - size.width - FLOAT_MARGIN);
  const minY = FLOAT_MARGIN;
  const maxY = Math.max(minY, container.height - bottomClearance - size.height);

  let left = Math.max(minX, Math.min(maxX, raw.left));
  let top = Math.max(minY, Math.min(maxY, raw.top));

  const SNAP_DIST = 20;

  // 1. Snap to bottom menu line
  if (Math.abs(top - maxY) < SNAP_DIST) {
    top = maxY;
  }
  // 2. Snap to container boundaries
  if (Math.abs(left - minX) < SNAP_DIST) left = minX;
  if (Math.abs(left - maxX) < SNAP_DIST) left = maxX;
  if (Math.abs(top - minY) < SNAP_DIST) top = minY;

  // 3. Snap / clip to other floating tiles
  for (const other of otherPositions) {
    // Snap horizontally adjacent
    if (Math.abs(left - (other.left + size.width + FLOAT_GAP)) < SNAP_DIST) {
      left = other.left + size.width + FLOAT_GAP;
    }
    if (Math.abs(left - (other.left - size.width - FLOAT_GAP)) < SNAP_DIST) {
      left = other.left - size.width - FLOAT_GAP;
    }
    // Snap vertically adjacent
    if (Math.abs(top - (other.top + size.height + FLOAT_GAP)) < SNAP_DIST) {
      top = other.top + size.height + FLOAT_GAP;
    }
    if (Math.abs(top - (other.top - size.height - FLOAT_GAP)) < SNAP_DIST) {
      top = other.top - size.height - FLOAT_GAP;
    }
    // Snap flush alignment
    if (Math.abs(left - other.left) < SNAP_DIST) left = other.left;
    if (Math.abs(top - other.top) < SNAP_DIST) top = other.top;
  }

  // Re-clamp after snapping
  left = Math.max(minX, Math.min(maxX, left));
  top = Math.max(minY, Math.min(maxY, top));

  return { left, top };
}

function DraggableTile({
  slot,
  customPosition,
  size,
  containerSize,
  bottomClearance,
  otherPositions = [],
  onTap,
  onDropAt,
  children,
}: {
  slot: Slot;
  customPosition?: Slot;
  size: { width: number; height: number };
  containerSize: { width: number; height: number };
  bottomClearance: number;
  otherPositions?: Slot[];
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

  // Calculate base position clamped above bottom menu clearance
  const maxY = Math.max(FLOAT_MARGIN, containerSize.height - bottomClearance - size.height);
  const basePos = customPosition
    ? {
        left: Math.max(FLOAT_MARGIN, Math.min(Math.max(FLOAT_MARGIN, containerSize.width - size.width - FLOAT_MARGIN), customPosition.left)),
        top: Math.max(FLOAT_MARGIN, Math.min(maxY, customPosition.top)),
      }
    : slot;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = elRef.current;
    if (!el) return;
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: basePos.left,
      startTop: basePos.top,
      startedAt: Date.now(),
      moved: 0,
    };
    setDrag({ left: basePos.left, top: basePos.top });
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
    if (dropped && moved >= 8 && containerSize.width > 0 && containerSize.height > 0) {
      const snapped = snapPoint(dropped, size, containerSize, bottomClearance, otherPositions);
      onDropAt?.(snapped);
    }
  };

  const position = drag ?? basePos;

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
        transition: drag ? 'none' : 'left 220ms cubic-bezier(0.16, 1, 0.3, 1), top 220ms cubic-bezier(0.16, 1, 0.3, 1)',
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
  teacherName,
  joinCode,
  sessionTitle,
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

  const [inviteOpen, setInviteOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const meetingInfo = useMemo(() => {
    const rawCode = (joinCode || sessionId || '').trim();
    const digitsOnly = rawCode.replace(/\D/g, '');
    let displayMeetingId = rawCode;
    let urlCode = rawCode;

    if (digitsOnly.length === 12) {
      displayMeetingId = `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)} ${digitsOnly.slice(6, 9)} ${digitsOnly.slice(9, 12)}`;
      urlCode = `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}-${digitsOnly.slice(9, 12)}`;
    } else {
      const alphaOnly = rawCode.replace(/[^a-zA-Z]/g, '').toLowerCase();
      if (alphaOnly.length === 12) {
        displayMeetingId = `${alphaOnly.slice(0, 4)} ${alphaOnly.slice(4, 8)} ${alphaOnly.slice(8, 12)}`;
        urlCode = `${alphaOnly.slice(0, 4)}-${alphaOnly.slice(4, 8)}-${alphaOnly.slice(8, 12)}`;
      }
    }

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://novicetutor.com';
    const inviteUrl = `${baseUrl}/join/${urlCode}`;
    const fullInvitation = `Join Novice Tutor Live Class\nTopic: ${sessionTitle || 'Quran & Islamic Studies'}\n${teacherName ? `Teacher: ${teacherName}\n` : ''}Meeting ID: ${displayMeetingId}\nInvite Link: ${inviteUrl}\n\n* Note: Registered and approved students only. Guests wait in the waiting room until the teacher admits them.`;

    return {
      displayMeetingId,
      urlCode,
      inviteUrl,
      fullInvitation,
      title: sessionTitle || 'Novice Tutor Classroom',
      teacher: teacherName || (teacherIdentity ? teacherIdentity.split('@')[0] : 'Teacher'),
    };
  }, [joinCode, sessionId, sessionTitle, teacherName, teacherIdentity]);

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  }, []);

  const room = useRoomContext();
  const [pendingSpotlight, setPendingSpotlight] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPendingSpotlight(undefined);
  }, [metadata]);
  const roomSpotlight = pendingSpotlight !== undefined ? pendingSpotlight : parseSpotlightIdentity(metadata);

  const [localVolumes, setLocalVolumes] = useState<Record<string, number>>({});
  const volumes = useMemo(() => {
    const remote = parseVolumes(metadata);
    return { ...remote, ...localVolumes };
  }, [metadata, localVolumes]);

  useAppliedVolumes(volumes);
  useAudioPlaybackUnlock();

  const setVolume = useCallback(
    (base: string, volume: number) => {
      setLocalVolumes((prev) => ({ ...prev, [base]: volume }));
      try {
        if (room && room.remoteParticipants) {
          room.remoteParticipants.forEach((participant) => {
            if (baseIdentity(participant.identity) === base) {
              const gain = gainForSlider(volume);
              participant.setVolume(gain);
              participant.setVolume(gain, Track.Source.ScreenShareAudio);
            }
          });
        }
      } catch {}
      fetch(`/api/sessions/${sessionId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: base, volume }),
      }).catch(() => {});
    },
    [room, sessionId]
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
  const [tileMenuOpen, setTileMenuOpen] = useState(false);
  const [tileFit, setTileFit] = useState<'cover' | 'contain'>('contain');
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const tapStartTimeRef = useRef(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const resetIdleTimer = useCallback(() => {
    setChromeHidden(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (viewMenuOpen || peopleOpen || widgetState.showChat || effectsOpen || tileMenuOpen) return;
    idleTimerRef.current = setTimeout(() => {
      setChromeHidden(true);
    }, 3500);
  }, [viewMenuOpen, peopleOpen, widgetState.showChat, effectsOpen, tileMenuOpen]);

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
      fit={p.isLocal && p.trackRef.source === Track.Source.Camera ? tileFit : fit}
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

  const [customPositions, setCustomPositions] = useState<Record<string, Slot>>({});
  // Constant clearance so the video stage never shifts or resizes when controls appear/hide
  const bottomClearance = 84;

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

  const slots = computeSlots(stageSize, floatBox, orderedKeys.length, bottomClearance);

  const handleDrop = (key: string, point: { left: number; top: number }) => {
    setCustomPositions((prev) => ({
      ...prev,
      [key]: point,
    }));
  };

  const handleStagePointerDown = () => {
    tapStartTimeRef.current = Date.now();
  };

  const handleStagePointerUp = (e: React.PointerEvent) => {
    if (Date.now() - tapStartTimeRef.current < 300) {
      if (viewMenuOpen) setViewMenuOpen(false);
      if (effectsOpen) setEffectsOpen(false);
      if (tileMenuOpen) setTileMenuOpen(false);
      if (peopleOpen) setPeopleOpen(false);

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
              <div className="w-full h-full p-2 sm:p-3">
                {renderTile(focused)}
              </div>
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
              const slot = slots[orderedKeys.indexOf(p.key)] || { left: 14, top: 14 };
              const customPos = customPositions[p.key];
              const otherPosList = floating
                .filter((other) => other.key !== p.key)
                .map((other) => customPositions[other.key] || slots[orderedKeys.indexOf(other.key)])
                .filter(Boolean) as Slot[];

              return (
                <DraggableTile
                  key={p.key}
                  slot={slot}
                  customPosition={customPos}
                  size={floatBox}
                  containerSize={stageSize}
                  bottomClearance={bottomClearance}
                  otherPositions={otherPosList}
                  onTap={hasMultipleCameras && p.isLocal ? cycleCamera : undefined}
                  onDropAt={(point) => handleDrop(p.key, point)}
                >
                  {renderTile(p, 'cover')}
                </DraggableTile>
              );
            })}

            {/* Top-Left Olive Tree Brand Logo / Zoom-Style Meeting Details Button */}
            <div
              className={`fixed z-[60] pointer-events-auto transition-all duration-300 ${
                chromeHidden && !inviteOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                top: 'max(16px, env(safe-area-inset-top))',
                left: 'max(16px, env(safe-area-inset-left))',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInviteOpen((v) => !v);
                }}
                title="Class Details & Invite Link"
                aria-label="Class Details and Invite Link"
                className="group flex items-center gap-2.5 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full cursor-pointer transition-all duration-200 active:scale-95 text-white font-semibold text-xs shadow-2xl hover:brightness-115 select-none"
                style={{
                  background: 'rgba(24, 26, 34, 0.70)',
                  backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  border: '1px solid rgba(255, 255, 255, 0.20)',
                  boxShadow:
                    '0 12px 36px rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center overflow-hidden shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                  <img src="/logo.png?v=3" alt="Novice Tutor" className="w-full h-full object-contain p-0.5" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[11px] sm:text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                    <span>Meeting Info</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  </span>
                  <span className="text-[9px] text-white/50 font-mono tracking-wider">
                    {meetingInfo.displayMeetingId.slice(0, 7)}…
                  </span>
                </div>
              </button>

              {/* Meeting Info & Invite Modal (Zoom / FaceTime style) */}
              {inviteOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm animate-fadeIn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviteOpen(false);
                    }}
                  />
                  <div
                    className="fixed left-4 sm:left-6 top-16 sm:top-20 z-[81] w-[calc(100vw-32px)] max-w-sm rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-hidden text-left"
                    style={{
                      background: 'rgba(24, 26, 34, 0.92)',
                      backdropFilter: 'blur(40px) saturate(200%) contrast(105%)',
                      WebkitBackdropFilter: 'blur(40px) saturate(200%) contrast(105%)',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      boxShadow:
                        '0 28px 64px rgba(0, 0, 0, 0.65), inset 0 1px 0 0 rgba(255, 255, 255, 0.45), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 p-1 flex items-center justify-center shrink-0 shadow-md">
                          <img src="/logo.png?v=3" alt="Novice Tutor" className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-white truncate tracking-tight">
                            {meetingInfo.title}
                          </h3>
                          <p className="text-[11px] text-white/50 truncate flex items-center gap-1.5 mt-0.5">
                            <span>Teacher: {meetingInfo.teacher}</span>
                            <span className="text-emerald-400 font-medium">● Live</span>
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setInviteOpen(false)}
                        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Meeting ID Section */}
                    <div className="mt-4 space-y-3.5">
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-white/45 block mb-1">
                          Meeting ID
                        </label>
                        <div
                          className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl border"
                          style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            borderColor: 'rgba(255, 255, 255, 0.12)',
                          }}
                        >
                          <span className="text-sm sm:text-base font-bold font-mono text-emerald-400 tracking-wider">
                            {meetingInfo.displayMeetingId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(meetingInfo.displayMeetingId, 'id')}
                            className="px-2.5 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
                            style={{
                              background: copiedKey === 'id' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.12)',
                              color: copiedKey === 'id' ? '#6ee7b7' : '#ffffff',
                            }}
                          >
                            {copiedKey === 'id' ? '✓ Copied' : 'Copy ID'}
                          </button>
                        </div>
                      </div>

                      {/* Invite Link Section */}
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-wider text-white/45 block mb-1">
                          Invite Link
                        </label>
                        <div
                          className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl border gap-2"
                          style={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            borderColor: 'rgba(255, 255, 255, 0.12)',
                          }}
                        >
                          <input
                            type="text"
                            readOnly
                            value={meetingInfo.inviteUrl}
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className="text-xs font-mono text-white/90 bg-transparent border-0 outline-none w-full select-all cursor-pointer truncate"
                          />
                          <button
                            type="button"
                            onClick={() => copyToClipboard(meetingInfo.inviteUrl, 'link')}
                            className="px-2.5 py-1 rounded-xl text-xs font-semibold cursor-pointer transition-all active:scale-95 shrink-0 flex items-center gap-1.5"
                            style={{
                              background: copiedKey === 'link' ? 'rgba(52, 211, 153, 0.25)' : 'rgba(59, 130, 246, 0.35)',
                              color: copiedKey === 'link' ? '#6ee7b7' : '#93c5fd',
                            }}
                          >
                            {copiedKey === 'link' ? '✓ Copied' : 'Copy Link'}
                          </button>
                        </div>
                      </div>

                      {/* Action Buttons: Native Share (Android/iOS) + Full Invitation */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await shareOrCopy(
                              {
                                title: meetingInfo.title,
                                text: meetingInfo.fullInvitation,
                                url: meetingInfo.inviteUrl,
                              },
                              meetingInfo.fullInvitation
                            );
                            if (res.method === 'shared' || res.method === 'copied') {
                              setCopiedKey('share');
                              setTimeout(() => setCopiedKey(null), 2500);
                            }
                          }}
                          className="w-full py-2.5 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md"
                          style={{
                            background:
                              copiedKey === 'share'
                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.9))'
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          }}
                        >
                          <span>{copiedKey === 'share' ? '✓ Done!' : '📲 Share / Send'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(meetingInfo.fullInvitation, 'all')}
                          className="w-full py-2.5 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-md"
                          style={{
                            background:
                              copiedKey === 'all'
                                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.9))'
                                : 'linear-gradient(135deg, rgba(37, 99, 235, 0.9), rgba(29, 78, 216, 0.9))',
                          }}
                        >
                          <span>{copiedKey === 'all' ? '✓ Copied!' : '📋 Copy All'}</span>
                        </button>
                      </div>

                      {/* Security & Waiting Room Notice */}
                      <div
                        className="p-3 rounded-2xl border flex items-start gap-2.5 text-[11px] leading-relaxed"
                        style={{
                          background: 'rgba(245, 158, 11, 0.08)',
                          borderColor: 'rgba(245, 158, 11, 0.22)',
                          color: 'rgba(253, 230, 138, 0.90)',
                        }}
                      >
                        <span className="text-amber-400 text-sm mt-0.5">🛡️</span>
                        <div>
                          <strong className="font-semibold text-amber-300 block mb-0.5">
                            Teacher Admission Gated
                          </strong>
                          Anyone with this link or code can request to join. Guests wait in the waiting room until the teacher admits them.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Fixed Right-Aligned Layout Switcher Pill */}
            <div
              className={`fixed z-[60] pointer-events-auto transition-opacity duration-300 ${
                chromeHidden && !viewMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                top: 'max(16px, env(safe-area-inset-top))',
                right: 'max(16px, env(safe-area-inset-right))',
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
                className="flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2 rounded-full cursor-pointer transition-transform duration-200 active:scale-95 text-white font-semibold text-xs shadow-2xl hover:brightness-110 select-none"
                style={{
                  background: 'rgba(24, 26, 34, 0.70)',
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
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setViewMenuOpen(false);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewMenuOpen(false);
                    }}
                  />
                  <div
                    className="absolute right-0 top-12 z-[81] w-56 rounded-2xl p-1.5 shadow-2xl animate-fadeIn overflow-hidden"
                    style={{
                      background: 'rgba(24, 26, 34, 0.90)',
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

            {/* Google Meet 3-Button Action Pill (Reframe, Visual Effects, More Menu) */}
            <div
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[55] pointer-events-auto transition-all duration-300 ${
                chromeHidden ? 'opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
              }`}
            >
              <div
                className="flex items-center gap-1 p-1 rounded-full shadow-2xl"
                style={{
                  background: 'rgba(24, 26, 34, 0.65)',
                  backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  border: '1px solid rgba(255, 255, 255, 0.20)',
                  boxShadow:
                    '0 16px 40px rgba(0, 0, 0, 0.50), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* Button 1: Reframe / Fit */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTileFit((prev) => (prev === 'cover' ? 'contain' : 'cover'));
                  }}
                  title="Reframe video"
                  aria-label="Reframe video"
                  className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 hover:bg-white/15 text-white/90 hover:text-white"
                >
                  <FramePersonIcon className="w-5 h-5" />
                </button>

                {/* Button 2: Visual Effects / Background Replace */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEffectsOpen((v) => !v);
                  }}
                  title="Apply visual effects"
                  aria-label="Apply visual effects"
                  className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 text-white"
                  style={{
                    background: effects.active
                      ? 'linear-gradient(135deg, rgba(0, 122, 255, 0.45) 0%, rgba(0, 90, 220, 0.35) 100%)'
                      : 'transparent',
                    border: effects.active ? '1px solid rgba(120, 190, 255, 0.50)' : '1px solid transparent',
                    boxShadow: effects.active ? '0 4px 14px rgba(0, 122, 255, 0.35)' : 'none',
                  }}
                >
                  <VisualEffectsSparkleIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>

                {/* Button 3: More Options Menu */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTileMenuOpen((v) => !v);
                  }}
                  title="More options"
                  aria-label="More options"
                  className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 active:scale-90 hover:bg-white/15 text-white/90 hover:text-white"
                >
                  <MoreIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Context Menu matching Google Meet */}
              {tileMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[80]"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setTileMenuOpen(false);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTileMenuOpen(false);
                    }}
                  />
                  <div
                    className="absolute left-1/2 -translate-x-1/2 top-14 z-[81] w-56 rounded-3xl p-2 shadow-2xl animate-fadeIn overflow-hidden"
                    style={{
                      background: 'rgba(24, 26, 34, 0.85)',
                      backdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
                      WebkitBackdropFilter: 'blur(36px) saturate(200%) contrast(105%)',
                      border: '1px solid rgba(255, 255, 255, 0.20)',
                      boxShadow:
                        '0 24px 64px rgba(0, 0, 0, 0.60), inset 0 1px 0 0 rgba(255, 255, 255, 0.40), inset 0 -1px 0 0 rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {isModerator && (
                      <button
                        type="button"
                        onClick={() => {
                          handleSpotlight(localCamera?.base === focusIdentity ? null : localCamera?.base ?? null);
                          setTileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                      >
                        <span className="text-sm">📌</span>
                        <span>{localCamera?.base === focusIdentity ? 'Unpin self-view' : 'Spotlight / Pin self-view'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!document.fullscreenElement) {
                          document.documentElement.requestFullscreen().catch(() => {});
                        } else {
                          document.exitFullscreen().catch(() => {});
                        }
                        setTileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold text-white/90 hover:text-white hover:bg-white/10 cursor-pointer transition-colors"
                    >
                      <span className="text-sm">⛶</span>
                      <span>Toggle Fullscreen</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {effectsOpen && (
              <>
                <div
                  className="fixed inset-0 z-[80]"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setEffectsOpen(false);
                  }}
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

          {/* Always-active Guest Admission Prompt outside chromeHidden */}
          <GuestKnockPrompt sessionId={sessionId} />

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
            joinCode={joinCode}
            sessionTitle={sessionTitle}
            teacherName={teacherName}
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
