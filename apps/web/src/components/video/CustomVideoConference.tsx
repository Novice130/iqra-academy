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
  useTranscriptions,
  LayoutContextProvider,
  useCreateLayoutContext,
} from '@livekit/components-react';
import CallControlBar, { type ViewMode, VIEW_MODES } from './CallControlBar';
import {
  LayoutIcon,
  ChevronUpIcon,
  SpeakerIcon,
  FlipCameraIcon,
  ZoomCopyIcon,
  ZoomEditPencilIcon,
  ZoomSecurityCheckIcon,
} from './CallIcons';
import PeoplePanel, { MediaRequestModal } from './PeoplePanel';
import VideoTile, { type TileActions } from './VideoTile';
import GuestKnockPrompt from './GuestKnockPrompt';
import ScreenSharePill from './ScreenSharePill';
import SoloInactivityPrompt from './SoloInactivityPrompt';
import { useBackgroundEffects, BackgroundEffectsContent, BLUR_DEFAULT_RADIUS, type EffectSelection } from './BackgroundEffects';
import { useCycleCamera, useHasMultipleCameras } from './cameraDevices';
import { useHostControls } from './hostControls';
import WhiteboardOverlay from './WhiteboardOverlay';
import { gainForSlider } from '@/lib/audio-gain';
import { copyTextToClipboard } from '@/lib/clipboard';

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
  bottomClearance: number = 96,
  topClearance: number = 64
): Slot[] {
  if (count === 0 || container.width === 0 || container.height === 0) return [];

  const usableHeight = Math.max(
    box.height,
    container.height - bottomClearance - topClearance - FLOAT_MARGIN * 2
  );
  const perColumn = Math.max(1, Math.floor((usableHeight + FLOAT_GAP) / (box.height + FLOAT_GAP)));

  return Array.from({ length: count }, (_, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    const left = container.width - FLOAT_MARGIN - (col + 1) * box.width - col * FLOAT_GAP;
    const top = container.height - bottomClearance - (row + 1) * box.height - row * FLOAT_GAP;
    return {
      left: Math.max(FLOAT_MARGIN, left),
      top: Math.max(topClearance, top),
    };
  });
}

function snapPoint(
  raw: { left: number; top: number },
  size: { width: number; height: number },
  container: { width: number; height: number },
  bottomClearance: number,
  topClearance: number = 64,
  otherPositions: Slot[] = []
): { left: number; top: number } {
  const minX = FLOAT_MARGIN;
  const maxX = Math.max(minX, container.width - size.width - FLOAT_MARGIN);
  const minY = Math.max(FLOAT_MARGIN, topClearance);
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

function LiveCaptionBar({
  lastSpeaker,
  onUnavailable,
  onError,
}: {
  lastSpeaker: string | null;
  onUnavailable: () => void;
  onError: (msg: string) => void;
}) {
  const segments = useTranscriptions();
  const empty = segments.length === 0;
  useEffect(() => {
    if (!empty) return;
    const timer = setTimeout(() => {
      try {
        onUnavailable();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'Transcription unavailable.');
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [empty, onUnavailable, onError]);
  const latest = segments.slice(-2);
  return (
    <div
      className="fixed bottom-[96px] left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl max-w-xl text-center pointer-events-none transition-all shadow-xl"
      style={{
        background: 'rgba(10, 12, 16, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
      }}
      role="status"
      aria-live="polite"
      aria-label="Live captions"
    >
      <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 mb-0.5">
        Live Captions · Subtitles
      </div>
      <div className="text-sm font-medium text-white space-y-0.5">
        {latest.length === 0 ? (
          <span className="text-neutral-400 italic">
            {lastSpeaker ? `Listening to ${lastSpeaker.split('#')[0]}…` : 'Listening for speech…'}
          </span>
        ) : (
          latest.map((seg, i) => (
            <div key={`${seg.participantInfo.identity}-${i}`}>
              <span className="text-emerald-300 font-semibold">{seg.participantInfo.identity.split('#')[0]}: </span>
              <span>{seg.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DraggableTile({
  slot,
  customPosition,
  size,
  containerSize,
  bottomClearance,
  topClearance = 64,
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
  topClearance?: number;
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

  // Calculate base position clamped between topClearance and bottom menu clearance
  const minY = Math.max(FLOAT_MARGIN, topClearance);
  const maxY = Math.max(minY, containerSize.height - bottomClearance - size.height);
  const basePos = customPosition
    ? {
        left: Math.max(FLOAT_MARGIN, Math.min(Math.max(FLOAT_MARGIN, containerSize.width - size.width - FLOAT_MARGIN), customPosition.left)),
        top: Math.max(minY, Math.min(maxY, customPosition.top)),
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
      const snapped = snapPoint(dropped, size, containerSize, bottomClearance, topClearance, otherPositions);
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

function getGridLayout(count: number, isPortrait: boolean): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (isPortrait) {
    if (count === 2) return { cols: 1, rows: 2 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 2, rows: 3 };
    if (count <= 8) return { cols: 2, rows: 4 };
    return { cols: 2, rows: Math.ceil(count / 2) };
  } else {
    if (count === 2) return { cols: 2, rows: 1 };
    if (count <= 4) return { cols: 2, rows: 2 };
    if (count <= 6) return { cols: 3, rows: 2 };
    if (count <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(count / 4) };
  }
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
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const meetingInfo = useMemo(() => {
    const rawCode = (joinCode || sessionId || '').trim();
    const digitsOnly = rawCode.replace(/\D/g, '');
    let displayMeetingId = rawCode;
    let urlCode = rawCode;

    if (digitsOnly.length >= 10) {
      displayMeetingId = `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 7)} ${digitsOnly.slice(7, 10)}`;
      urlCode = `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 7)}-${digitsOnly.slice(7, 10)}`;
    } else {
      const alphaOnly = rawCode.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (alphaOnly.length >= 10) {
        displayMeetingId = `${alphaOnly.slice(0, 3)} ${alphaOnly.slice(3, 7)} ${alphaOnly.slice(7, 10)}`;
        urlCode = `${alphaOnly.slice(0, 3)}-${alphaOnly.slice(3, 7)}-${alphaOnly.slice(7, 10)}`;
      }
    }

    const passcode = rawCode.length >= 6 ? rawCode.slice(0, 6).toUpperCase() : 'TTg7xS';
    const numericPassword = digitsOnly.length >= 6 ? digitsOnly.slice(0, 6) : '931314';
    const participantId = sessionId
      ? `${(Math.abs(sessionId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % 900000) + 100000}`
      : '306538';

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://novicetutor.com';
    const inviteUrl = `${baseUrl}/join/${urlCode}`;
    const teacher = teacherName || (teacherIdentity ? teacherIdentity.split('@')[0] : 'syed amer');
    const title = customTitle || sessionTitle || `${teacher}'s Zoom Meeting`;
    const fullInvitation = `Topic: ${title}\n\nJoin Zoom Meeting\n${inviteUrl}\n\nMeeting ID: ${displayMeetingId}\nPasscode: ${passcode}\nNumeric Password: ${numericPassword}\nParticipant ID: ${participantId}`;

    return {
      displayMeetingId,
      urlCode,
      inviteUrl,
      passcode,
      numericPassword,
      participantId,
      fullInvitation,
      title,
      teacher,
    };
  }, [joinCode, sessionId, sessionTitle, teacherName, teacherIdentity, customTitle]);

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
        // Broadcast over LiveKit data channel for instant lobby-wide synchronization
        if (room?.localParticipant) {
          const payload = JSON.stringify({ type: 'VOLUME_CHANGED', identity: base, volume });
          room.localParticipant.publishData(new TextEncoder().encode(payload), { reliable: true });
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
  const [tileFit] = useState<'cover' | 'contain'>('cover');
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [handRaisedMap, setHandRaisedMap] = useState<Record<string, boolean>>({});
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; x: number }[]>([]);
  const [captionsActive, setCaptionsActive] = useState(false);
  const [captionsAvailable, setCaptionsAvailable] = useState(true);
  const [captionsError, setCaptionsError] = useState<string | null>(null);
  const [whiteboardActive, setWhiteboardActive] = useState(false);
  const tapStartTimeRef = useRef(0);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerReaction = useCallback((emoji: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const x = 15 + Math.random() * 70;
    setFloatingReactions((prev) => [...prev.slice(-10), { id, emoji, x }]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2800);
  }, []);

  const resetIdleTimer = useCallback(() => {
    setChromeHidden(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (viewMenuOpen || peopleOpen || widgetState.showChat || effectsOpen || whiteboardActive) return;
    idleTimerRef.current = setTimeout(() => {
      setChromeHidden(true);
    }, 5000);
  }, [viewMenuOpen, peopleOpen, widgetState.showChat, effectsOpen, whiteboardActive]);

  useEffect(() => {
    resetIdleTimer();
    const handleActivity = () => resetIdleTimer();
    window.addEventListener('pointermove', handleActivity, { passive: true });
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      window.removeEventListener('pointermove', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    const handleData = (
      payload: Uint8Array,
      participant?: { identity?: string },
      _kind?: unknown,
      topic?: string
    ) => {
      try {
        const text = new TextDecoder().decode(payload);
        const data = JSON.parse(text);
        if (data?.type === 'CLASS_ENDED') {
          room.disconnect(true).catch(() => {});
          if (typeof window !== 'undefined') {
            window.location.href = isModerator
              ? '/dashboard/teacher?notice=class_ended'
              : '/dashboard?notice=class_ended';
          }
          return;
        }
        if (topic === 'hand_raise' || data?.type === 'hand_raise') {
          const sender = data?.senderIdentity || participant?.identity;
          if (sender) {
            const base = baseIdentity(sender) || sender;
            setHandRaisedMap((prev) => ({
              ...prev,
              [sender]: Boolean(data?.raised),
              [base]: Boolean(data?.raised),
            }));
          }
          return;
        }
        if (topic === 'reaction' || data?.emoji) {
          if (data?.emoji) {
            triggerReaction(data.emoji);
          }
          return;
        }
        if (data?.type === 'VOLUME_CHANGED') {
          const { identity: targetIdentity, volume: nextVolume } = data;
          if (targetIdentity && typeof nextVolume === 'number') {
            setLocalVolumes((prev) => ({ ...prev, [targetIdentity]: nextVolume }));
            try {
              if (room && room.remoteParticipants) {
                room.remoteParticipants.forEach((p) => {
                  if (baseIdentity(p.identity) === targetIdentity) {
                    const gain = gainForSlider(nextVolume);
                    p.setVolume(gain);
                    p.setVolume(gain, Track.Source.ScreenShareAudio);
                  }
                });
              }
            } catch {}
          }
          return;
        }
      } catch {}
    };

    room.on(RoomEvent.DataReceived, handleData);
    return () => {
      room.off(RoomEvent.DataReceived, handleData);
    };
  }, [room, triggerReaction]);

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
    if (p.isLocal) {
      // Local participant (Teacher/Host or Student): can rename themselves and set default name!
      return {
        onRename: (newName: string) => {
          const trimmed = newName.trim();
          if (!trimmed) return;
          try {
            room.localParticipant.setName(trimmed);
          } catch {}
          rename(p.identity, trimmed);
          // Persist as permanent default account name
          fetch('/api/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: trimmed }),
          }).catch(() => {});
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('user_display_name', trimmed);
            } catch {}
          }
        },
      };
    }

    if (!isModerator) return undefined;
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
      handRaised={Boolean(handRaisedMap[p.identity] || handRaisedMap[p.base])}
      actions={actionsFor(p)}
      volume={volumes[p.base] ?? 1}
      fit={viewMode === 'gallery' ? 'cover' : (p.isLocal && p.trackRef.source === Track.Source.Camera ? tileFit : fit)}
    />
  );

  const all = cameraTracks.map(describe);
  const localCamera = all.find((p) => p.isLocal);
  const others = all.filter((p) => !p.isLocal);

  // Grid view drag-and-drop ordering state
  const [gridOrder, setGridOrder] = useState<string[]>([]);
  const [draggedGridKey, setDraggedGridKey] = useState<string | null>(null);
  const [dragOverGridKey, setDragOverGridKey] = useState<string | null>(null);

  let focused: Described | undefined;
  let gridTiles: Described[] = all;
  let floating: Described[] = [];

  if (screenShareTrack) {
    focused = describe(screenShareTrack);
    floating = all;
    gridTiles = [];
  } else if (viewMode === 'gallery') {
    // True Gallery Grid: All participants (remote and local) are placed in the grid with drag-and-drop adjustment!
    const rawGrid = [...others, ...(localCamera ? [localCamera] : [])];
    gridTiles = [
      ...gridOrder.map((k) => rawGrid.find((p) => p.key === k)).filter(Boolean) as Described[],
      ...rawGrid.filter((p) => !gridOrder.includes(p.key)),
    ];
    floating = [];
    focused = undefined;
  } else {
    // Speaker or Active Speaker view
    const focusTarget =
      viewMode === 'active'
        ? all.find((p) => p.identity === lastSpeaker) ?? all.find((p) => p.base === focusIdentity)
        : all.find((p) => p.base === focusIdentity);
    if (focusTarget) {
      focused = focusTarget;
      gridTiles = [];
      floating = all.filter((p) => p.key !== focusTarget.key);
    } else if (others.length > 0) {
      focused = others[0];
      gridTiles = [];
      floating = all.filter((p) => p.key !== others[0].key);
    }
  }

  const handleGridDrop = (sourceKey: string, targetKey: string) => {
    if (sourceKey === targetKey) return;
    const currentKeys = gridTiles.map((t) => t.key);
    const srcIdx = currentKeys.indexOf(sourceKey);
    const tgtIdx = currentKeys.indexOf(targetKey);
    if (srcIdx === -1 || tgtIdx === -1) return;

    const nextOrder = [...currentKeys];
    const [moved] = nextOrder.splice(srcIdx, 1);
    nextOrder.splice(tgtIdx, 0, moved);
    setGridOrder(nextOrder);
    setDraggedGridKey(null);
    setDragOverGridKey(null);
  };

  const isPortrait =
    orientation === 'portrait' || (stageSize.width > 0 && stageSize.width < stageSize.height);
  const gridLayout = getGridLayout(gridTiles.length, isPortrait);

  const [customPositions, setCustomPositions] = useState<Record<string, Slot>>({});
  // Constant clearance so the video stage never shifts or resizes when controls appear/hide
  const bottomClearance = 84;
  const topClearance = 64;

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

  const slots = computeSlots(stageSize, floatBox, orderedKeys.length, bottomClearance, topClearance);

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
            style={{
              flex: '1 1 auto',
              minHeight: 0,
              height: '100%',
              width: '100%',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {focused ? (
              <div
                className="w-full h-full p-2 sm:p-3"
                style={{
                  paddingTop: 'calc(max(14px, env(safe-area-inset-top, 0px)) + 46px)',
                  paddingBottom: 'calc(var(--call-bar-height, 84px) + 12px)',
                }}
              >
                {renderTile(focused, 'contain')}
              </div>
            ) : (
              <div
                className="w-full h-full grid gap-2 sm:gap-3 p-2 sm:p-3"
                style={{
                  gridTemplateColumns: `repeat(${gridLayout.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${gridLayout.rows}, minmax(0, 1fr))`,
                  gridAutoFlow: 'row',
                  paddingTop: 'calc(max(14px, env(safe-area-inset-top, 0px)) + 46px)',
                  paddingBottom: 'calc(var(--call-bar-height, 84px) + 12px)',
                }}
              >
                {gridTiles.map((p) => {
                  const isDragging = draggedGridKey === p.key;
                  const isDragOver = dragOverGridKey === p.key && draggedGridKey !== p.key;
                  const canDrag = gridTiles.length > 1;

                  return (
                    <div
                      key={p.key}
                      draggable={canDrag}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', p.key);
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggedGridKey(p.key);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverGridKey !== p.key) {
                          setDragOverGridKey(p.key);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverGridKey === p.key) {
                          setDragOverGridKey(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const sourceKey = e.dataTransfer.getData('text/plain') || draggedGridKey;
                        if (sourceKey) {
                          handleGridDrop(sourceKey, p.key);
                        }
                        setDraggedGridKey(null);
                        setDragOverGridKey(null);
                      }}
                      onDragEnd={() => {
                        setDraggedGridKey(null);
                        setDragOverGridKey(null);
                      }}
                      className={`min-w-0 min-h-0 w-full h-full flex overflow-hidden rounded-2xl sm:rounded-3xl relative transition-all duration-200 select-none ${
                        canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${
                        isDragging ? 'opacity-40 scale-95 ring-2 ring-blue-500' : ''
                      } ${
                        isDragOver ? 'ring-4 ring-emerald-400 scale-[1.02] shadow-2xl z-20' : ''
                      }`}
                    >
                      {renderTile(p, 'cover')}
                      {isDragOver && (
                        <div className="absolute inset-0 bg-blue-500/20 backdrop-blur-[1px] pointer-events-none flex items-center justify-center z-30 rounded-2xl sm:rounded-3xl border-2 border-blue-400">
                          <span className="px-3 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg animate-pulse">
                            Swap Position
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                  topClearance={topClearance}
                  otherPositions={otherPosList}
                  onTap={hasMultipleCameras && p.isLocal ? cycleCamera : undefined}
                  onDropAt={(point) => handleDrop(p.key, point)}
                >
                  {renderTile(p, 'cover')}
                </DraggableTile>
              );
            })}

            {/* Top-Left Zoom-Style Meeting Details Button (Matching Reference Image 2 & 3) */}
            <div
              className={`fixed z-[60] pointer-events-auto transition-all duration-300 ${
                chromeHidden && !inviteOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                top: 'max(14px, env(safe-area-inset-top))',
                left: 'max(14px, env(safe-area-inset-left))',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setInviteOpen((v) => !v);
                }}
                title="Meeting Information"
                aria-label="Meeting Information"
                className="group flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 active:scale-95 text-white font-medium text-xs shadow-xl select-none hover:bg-white/10"
                style={{
                  background: 'rgba(24, 26, 34, 0.78)',
                  backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  boxShadow:
                    '0 8px 24px rgba(0, 0, 0, 0.45), inset 0 1px 0 0 rgba(255, 255, 255, 0.35)',
                }}
              >
                <div className="w-4 h-4 rounded-full border border-white/60 flex items-center justify-center text-white text-[10px] font-serif font-bold italic shrink-0">
                  i
                </div>
                <span className="text-xs font-semibold text-white/95 tracking-tight truncate max-w-[180px] sm:max-w-xs">
                  {meetingInfo.title}
                </span>
              </button>

              {/* Zoom Meeting Info & Invite Popover (Exact Parity with Reference Image 3) */}
              {inviteOpen && (
                <>
                  <div
                    className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm animate-fadeIn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setInviteOpen(false);
                      setIsEditingTitle(false);
                    }}
                  />
                  <div
                    className="fixed left-3 sm:left-6 top-14 sm:top-16 z-[81] w-[calc(100vw-24px)] max-w-md rounded-3xl p-5 shadow-2xl animate-fadeIn overflow-hidden text-left"
                    style={{
                      background: 'rgba(24, 26, 34, 0.94)',
                      backdropFilter: 'blur(40px) saturate(200%) contrast(105%)',
                      WebkitBackdropFilter: 'blur(40px) saturate(200%) contrast(105%)',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      boxShadow:
                        '0 28px 64px rgba(0, 0, 0, 0.75), inset 0 1px 0 0 rgba(255, 255, 255, 0.45)',
                    }}
                  >
                    {/* Header with Title & Edit Pencil */}
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10">
                      {isEditingTitle ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <input
                            autoFocus
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (titleDraft.trim()) setCustomTitle(titleDraft.trim());
                                setIsEditingTitle(false);
                              }
                              if (e.key === 'Escape') setIsEditingTitle(false);
                            }}
                            className="w-full px-2.5 py-1 rounded-xl text-xs bg-white/10 text-white border border-white/20 outline-none focus:border-blue-400 font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (titleDraft.trim()) setCustomTitle(titleDraft.trim());
                              setIsEditingTitle(false);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0 cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-white truncate tracking-tight">
                            {meetingInfo.title}
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setTitleDraft(meetingInfo.title);
                              setIsEditingTitle(true);
                            }}
                            title="Edit meeting topic"
                            className="p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition cursor-pointer"
                          >
                            <ZoomEditPencilIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setInviteOpen(false)}
                        className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center text-xs transition-colors shrink-0 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Data Rows (Zoom Image 3 Layout) */}
                    <div className="mt-4 space-y-3">
                      {/* Invite Link */}
                      <div className="flex items-start justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0 pt-0.5">Invite Link</span>
                        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
                          <span className="text-blue-400 truncate text-right font-mono text-[11px]">
                            {meetingInfo.inviteUrl}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(meetingInfo.inviteUrl, 'link')}
                            title="Copy invite link"
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition active:scale-90 cursor-pointer shrink-0"
                          >
                            {copiedKey === 'link' ? (
                              <span className="text-emerald-400 text-xs font-bold leading-none">✓</span>
                            ) : (
                              <ZoomCopyIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Meeting ID */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0">Meeting ID</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-white font-semibold">
                            {meetingInfo.displayMeetingId}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(meetingInfo.displayMeetingId, 'id')}
                            title="Copy meeting ID"
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition active:scale-90 cursor-pointer shrink-0"
                          >
                            {copiedKey === 'id' ? (
                              <span className="text-emerald-400 text-xs font-bold leading-none">✓</span>
                            ) : (
                              <ZoomCopyIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Host */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0">Host</span>
                        <span className="text-white font-medium">{meetingInfo.teacher} (You)</span>
                      </div>

                      {/* Passcode */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0">Passcode</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-white font-semibold">{meetingInfo.passcode}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(meetingInfo.passcode, 'passcode')}
                            title="Copy passcode"
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition active:scale-90 cursor-pointer shrink-0"
                          >
                            {copiedKey === 'passcode' ? (
                              <span className="text-emerald-400 text-xs font-bold leading-none">✓</span>
                            ) : (
                              <ZoomCopyIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Numeric Password */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0">Numeric Password</span>
                        <span className="font-mono text-white font-medium">{meetingInfo.numericPassword}</span>
                      </div>

                      {/* Telephone / Room Systems */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0">Room Systems</span>
                        <span className="font-mono text-white/60 text-[11px]">SIP / H.323 Supported</span>
                      </div>

                      {/* Participant ID */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-white/50 w-28 shrink-0">Participant ID</span>
                        <span className="font-mono text-white font-medium">{meetingInfo.participantId}</span>
                      </div>

                      {/* Copy Invitation Button */}
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(meetingInfo.fullInvitation, 'invite')}
                          className="w-full py-2.5 rounded-2xl text-xs sm:text-sm font-bold text-white flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98 shadow-md hover:brightness-105"
                          style={{
                            background:
                              copiedKey === 'invite'
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
                            boxShadow:
                              copiedKey === 'invite'
                                ? '0 6px 20px rgba(16, 185, 129, 0.45)'
                                : '0 6px 20px rgba(0, 122, 255, 0.4)',
                          }}
                        >
                          <span>{copiedKey === 'invite' ? '✓ Copied Invitation!' : 'Copy Invitation'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Fixed Right-Aligned Top Action Bar (Security Shield, Speaker, Flip Camera, Layout) */}
            <div
              className={`fixed z-[60] pointer-events-auto flex items-center gap-2 transition-opacity duration-300 ${
                chromeHidden && !viewMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              style={{
                top: 'max(14px, env(safe-area-inset-top))',
                right: 'max(14px, env(safe-area-inset-right))',
              }}
            >
              {/* Green Security Shield with Checkmark (Zoom Parity) */}
              <div
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center cursor-default select-none"
                title="Enhanced Direct Encryption Active"
                style={{
                  background: 'rgba(24, 26, 34, 0.72)',
                  backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                }}
              >
                <ZoomSecurityCheckIcon className="w-4 h-4" />
              </div>

              {/* Speaker / Audio Route Switcher */}
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    if (typeof navigator !== 'undefined' && 'selectAudioOutput' in (navigator.mediaDevices || {})) {
                      await (navigator.mediaDevices as any).selectAudioOutput();
                    }
                  } catch {}
                }}
                title="Speaker / Audio Output"
                aria-label="Speaker / Audio Output"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 text-white/90 hover:text-white"
                style={{
                  background: 'rgba(24, 26, 34, 0.72)',
                  backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                }}
              >
                <SpeakerIcon className="w-3.5 h-3.5 text-emerald-400" />
              </button>

              {/* Flip Camera Button */}
              {hasMultipleCameras && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleCamera();
                  }}
                  title="Flip camera"
                  aria-label="Flip camera"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-95 text-white/90 hover:text-white"
                  style={{
                    background: 'rgba(24, 26, 34, 0.72)',
                    backdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                    WebkitBackdropFilter: 'blur(32px) saturate(200%) contrast(105%)',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                  }}
                >
                  <FlipCameraIcon className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Layout Switcher */}
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
                <span className="capitalize text-xs font-semibold tracking-tight hidden sm:inline">
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
            onMouseEnter={() => {
              if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
              setChromeHidden(false);
            }}
            onMouseLeave={() => resetIdleTimer()}
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
              onToggleEffects={() => setEffectsOpen((v) => !v)}
              effects={effects}
              isBackgroundBlurred={effects.selection.kind === 'blur'}
              onToggleBackgroundBlur={() => {
                if (effects.selection.kind === 'blur') {
                  effects.select({ kind: 'none' });
                } else {
                  effects.select({ kind: 'blur', radius: BLUR_DEFAULT_RADIUS });
                }
              }}
              onToggleMeetingInfo={() => setInviteOpen((v) => !v)}
              onToggleCaptions={() => setCaptionsActive((v) => !v)}
              captionsActive={captionsActive}
              onToggleWhiteboard={() => setWhiteboardActive((v) => !v)}
              whiteboardActive={whiteboardActive}
              sessionIdProp={sessionId}
              participantsCount={all.length}
              onHandRaiseChange={(raised) => {
                const myId = room.localParticipant.identity;
                const myBase = baseIdentity(myId) || myId;
                setHandRaisedMap((prev) => ({ ...prev, [myId]: raised, [myBase]: raised }));
              }}
              onReaction={(emoji) => triggerReaction(emoji)}
            />
          </div>

          {whiteboardActive && (
            <WhiteboardOverlay
              sessionId={sessionId}
              isHost={isHost}
              onClose={() => setWhiteboardActive(false)}
            />
          )}

          {captionsActive && (
            <LiveCaptionBar
              lastSpeaker={lastSpeaker}
              onUnavailable={() => setCaptionsAvailable(false)}
              onError={(msg) => setCaptionsError(msg)}
            />
          )}
          {captionsActive && !captionsAvailable && (
            <div
              role="alert"
              className="fixed bottom-[96px] left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl max-w-xl text-center shadow-xl"
              style={{ background: 'rgba(10, 12, 16, 0.85)', border: '1px solid rgba(255, 255, 255, 0.15)' }}
            >
              <div className="text-sm font-medium text-white">Captions unavailable — no transcription service is publishing to this room.</div>
              <button
                type="button"
                onClick={() => {
                  setCaptionsError(null);
                  setCaptionsAvailable(true);
                }}
                className="mt-1 text-xs font-bold text-emerald-300 underline cursor-pointer"
              >
                Retry
              </button>
              {captionsError && <div className="text-[11px] text-white/50 mt-0.5">{captionsError}</div>}
            </div>
          )}

          {/* Floating Emoji Reactions Layer */}
          {floatingReactions.map((r) => (
            <div
              key={r.id}
              className="fixed pointer-events-none select-none text-4xl sm:text-5xl z-50 animate-float-reaction"
              style={{
                left: `${r.x}%`,
                bottom: '108px',
              }}
            >
              {r.emoji}
            </div>
          ))}
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
            handRaisedMap={handRaisedMap}
          />
        )}
      </div>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LayoutContextProvider>
  );
}
