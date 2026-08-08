'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import { isTrackReference, type TrackReferenceOrPlaceholder, type WidgetState } from '@livekit/components-core';
import {
  Chat,
  RoomAudioRenderer,
  ConnectionStateToast,
  useTracks,
  useRoomContext,
  useSpeakingParticipants,
  LayoutContextProvider,
  useCreateLayoutContext,
} from '@livekit/components-react';
import CallControlBar, { type ViewMode } from './CallControlBar';
import PeoplePanel, { MediaRequestModal } from './PeoplePanel';
import VideoTile, { type TileActions } from './VideoTile';
import GuestKnockPrompt from './GuestKnockPrompt';
import ScreenSharePill from './ScreenSharePill';
import { useBackgroundEffects, type EffectSelection } from './BackgroundEffects';
import { useCycleCamera, useHasMultipleCameras } from './cameraDevices';
import { useHostControls } from './hostControls';

/**
 * useRoomInfo()'s metadata doesn't reliably re-render on RoomMetadataChanged
 * in this component tree, so subscribe to the room directly instead.
 */
function useLiveRoomMetadata(): string | undefined {
  const room = useRoomContext();
  const [metadata, setMetadata] = useState<string | undefined>(room.metadata);

  useEffect(() => {
    const handler = () => setMetadata(room.metadata);
    handler();
    // RoomMetadataChanged only fires on genuine changes — Connected also
    // catches a late joiner picking up metadata that was already set before
    // they connected (the join handshake itself isn't a "change" event).
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
  sessionId: string;
  /** The class teacher's identity (their email), from the join API. */
  teacherIdentity: string | null;
  /** Background effect chosen on the pre-join screen, if any. */
  initialEffect?: EffectSelection;
}

/**
 * Strips the per-connection suffix from a LiveKit identity (`me@x.com#a1b2`).
 * The same person on a phone and a laptop is two participants with two
 * identities but one base — spotlight is about the person, so it matches on
 * the base. Muting and renaming stay per-connection and use the full identity.
 */
function baseIdentity(identity: string | null | undefined): string | null {
  if (!identity) return null;
  return identity.split('#')[0];
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

/**
 * Tracks whether the *viewport* is portrait or landscape — a phone held
 * upright vs. a laptop/tablet/phone rotated sideways. Driving the floating
 * tile's aspect ratio off this (rather than a fixed landscape box) means a
 * phone's tall camera feed isn't squeezed into a wide box and center-cropped
 * down to a sliver near the top.
 */
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

/** Gap between floating tiles, and from the edge of the video area. */
const FLOAT_GAP = 10;
const FLOAT_MARGIN = 12;

interface Slot {
  left: number;
  top: number;
}

/**
 * Parking slots for the floating tiles, filled bottom-right first and stacked
 * upward, wrapping into a second column when the first one runs out of height.
 *
 * Slots exist so tiles can never sit on top of each other. The old code
 * offset each tile by a flat 124px, which is fine for the 110px-tall landscape
 * box and badly wrong for the 180px-tall portrait one — on a phone every peer
 * covered the one below it, which is exactly what a class of three looked
 * like.
 */
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
    // Anchored to the bottom-right corner so the newest tiles march up and
    // then leftward, staying clear of the main video's centre.
    const left = container.width - FLOAT_MARGIN - (col + 1) * box.width - col * FLOAT_GAP;
    const top = container.height - FLOAT_MARGIN - (row + 1) * box.height - row * FLOAT_GAP;
    return {
      left: Math.max(FLOAT_MARGIN, left),
      top: Math.max(FLOAT_MARGIN, top),
    };
  });
}

/**
 * Small floating tile — the self-view, and each peer while someone is
 * spotlighted. Draggable, but it always lands in a slot: on release it snaps
 * to the nearest one, swapping with whoever is parked there. Free-form
 * dragging is what let them overlap in the first place.
 */
function DraggableTile({
  slot,
  size,
  onTap,
  onDropAt,
  children,
}: {
  slot: Slot;
  size: { width: number; height: number };
  /** Fired on a tap that wasn't a drag — used to flip the camera. */
  onTap?: () => void;
  /** Where the tile was let go, in container coordinates. */
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

    // A tap and the start of a drag are the same gesture until the finger
    // moves, so only treat it as a tap if it barely moved and was quick.
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
      className="absolute z-40 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
      style={{
        width: size.width,
        height: size.height,
        left: position.left,
        top: position.top,
        // The glide back into a slot is what makes the snap read as
        // deliberate rather than as the tile jumping away from your finger.
        transition: drag ? 'none' : 'left 160ms ease-out, top 160ms ease-out',
        border: '2px solid rgba(255,255,255,0.3)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
        touchAction: 'none',
      }}
    >
      {children}
    </div>
  );
}

/** Columns that keep tiles as close to square-ish as the count allows. */
function columnsFor(count: number) {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export default function CustomVideoConference({
  isModerator,
  sessionId,
  teacherIdentity,
  initialEffect,
}: CustomVideoConferenceProps) {
  const layoutContext = useCreateLayoutContext();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], { onlySubscribed: false });
  const micTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
  const metadata = useLiveRoomMetadata();
  const { muteTrack, askToUnmute, askForCamera, rename, removeParticipant } = useHostControls(sessionId);

  // Optimistic override so the moderator who clicked sees an instant result
  // instead of waiting on the metadata round-trip; cleared once the room's
  // own metadata event confirms the change (or any other change supersedes it).
  const [pendingSpotlight, setPendingSpotlight] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPendingSpotlight(undefined);
  }, [metadata]);
  const roomSpotlight = pendingSpotlight !== undefined ? pendingSpotlight : parseSpotlightIdentity(metadata);

  // What "speaker" view focuses. Room metadata wins, but until it arrives (or
  // if it was never written) fall back to the class teacher — a student
  // should never open the call and find an admin who dropped in to observe
  // filling their screen.
  const focusIdentity = baseIdentity(roomSpotlight) ?? baseIdentity(teacherIdentity);

  // Per-viewer layout choice, like Zoom's gallery/speaker toggle — local only,
  // never synced. The defaults differ by role on purpose: a teacher wants
  // every student on screen at once, a student wants the teacher big.
  const [viewMode, setViewMode] = useState<ViewMode>(isModerator ? 'gallery' : 'speaker');

  // Active-speaker view needs the *last* person to speak, not the current
  // one: LiveKit's list empties the moment everybody stops talking, and a
  // screen that falls back to the grid during every pause is unwatchable.
  const speakers = useSpeakingParticipants();
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  useEffect(() => {
    // Prefer whoever isn't you — your own voice is not what you want to watch.
    const speaking = speakers.find((p) => !p.isLocal) ?? speakers[0];
    if (speaking) setLastSpeaker(speaking.identity);
  }, [speakers]);

  const [widgetState, setWidgetState] = useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });

  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();
  const effects = useBackgroundEffects(initialEffect);
  const [peopleOpen, setPeopleOpen] = useState(false);

  // Floating tiles are positioned in pixels, so the video area has to be
  // measured rather than guessed — it changes with the chat panel, rotation,
  // and the browser's disappearing address bar.
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
    orientation === 'portrait' ? { width: 110, height: 180 } : { width: 180, height: 110 };

  /** Which slot each floating tile is parked in, keyed by tile. Drag swaps them. */
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
          // fetch() only rejects on network failure, not on 4xx/5xx — a
          // silent server-side failure would otherwise look like it worked
          // while nobody else's view ever changed.
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

  /** Everything a tile needs to render and be acted on. */
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
    };
  };

  const renderTile = (p: Described, fit: 'cover' | 'contain' = 'contain') => (
    <VideoTile
      trackRef={p.trackRef}
      name={p.name}
      micMuted={p.micMuted}
      cameraOff={p.cameraOff}
      isLocal={p.isLocal}
      isSpotlighted={p.base === focusIdentity}
      actions={actionsFor(p)}
      fit={fit}
    />
  );

  const all = cameraTracks.map(describe);
  const localCamera = all.find((p) => p.isLocal);
  const others = all.filter((p) => !p.isLocal);

  // Screen share wins for everyone. Otherwise gallery puts every camera in a
  // grid, and speaker gives the focused person the frame with everyone else
  // as draggable tiles.
  let focused: Described | undefined;
  let gridTiles: Described[] = all;
  let floating: Described[] = [];

  if (screenShareTrack) {
    focused = describe(screenShareTrack);
    floating = all;
    gridTiles = [];
  } else if (viewMode === 'gallery') {
    // A teacher's own camera floats as a self-view so the grid is all
    // students — unless they're alone, where an empty grid is just a black
    // void.
    if (isModerator && others.length > 0) {
      gridTiles = others;
      floating = localCamera ? [localCamera] : [];
    }
  } else {
    // Speaker follows the room's spotlight; active-speaker follows the voice,
    // falling back to the spotlight until somebody actually says something.
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

  // Keep the parking order stable across re-renders: people who were already
  // floating stay where the viewer dragged them, newcomers take the next free
  // slot, and anyone who left frees theirs.
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
    // floatingKeys is derived from the track list; join it so the effect only
    // runs when the set of floating participants actually changes.
  }, [floatingKeys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const slots = computeSlots(stageSize, floatBox, orderedKeys.length);

  /** Snap a dropped tile to the nearest slot, swapping with whoever is there. */
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

  return (
    <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
      {/* Bar height (and the --lk-control-bar-height the chat panel sizes
          itself against) lives in globals.css so it can shrink on a phone
          held sideways, where a 76px bar eats a quarter of the screen. */}
      <div className="lk-video-conference call-surface" style={{ height: '100%' }}>
        <div className="lk-video-conference-inner" style={{ height: '100%', position: 'relative' }}>
          <div
            ref={stageRef}
            style={{ flex: '1 1 auto', minHeight: 0, position: 'relative', overflow: 'hidden' }}
          >
            {focused ? (
              <div className="w-full h-full p-2">{renderTile(focused)}</div>
            ) : (
              <div
                className="w-full h-full grid gap-2 p-2"
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

            {/* Peers (and the teacher's own camera in gallery) float as small
                draggable tiles, each parked in its own slot so they never
                cover one another. */}
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
                  {/* Small tiles fill their box; the main tiles show the whole
                      frame (see VideoTile's `fit`). */}
                  {renderTile(p, 'cover')}
                </DraggableTile>
              );
            })}
          </div>

          <ScreenSharePill />

          {isModerator && <GuestKnockPrompt sessionId={sessionId} />}

          <MediaRequestModal />

          <CallControlBar
            effects={effects}
            unreadMessages={widgetState.unreadMessages}
            chatOpen={widgetState.showChat}
            peopleOpen={peopleOpen}
            onToggleChat={() => layoutContext.widget.dispatch?.({ msg: 'toggle_chat' })}
            onTogglePeople={() => setPeopleOpen((v) => !v)}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>

        <Chat style={{ display: widgetState.showChat ? 'grid' : 'none' }} />

        {peopleOpen && (
          <PeoplePanel
            sessionId={sessionId}
            isModerator={isModerator}
            spotlightIdentity={focusIdentity}
            onSpotlight={handleSpotlight}
            onClose={() => setPeopleOpen(false)}
          />
        )}
      </div>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LayoutContextProvider>
  );
}
