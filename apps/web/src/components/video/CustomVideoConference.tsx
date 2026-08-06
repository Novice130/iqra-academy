'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import type { TrackReferenceOrPlaceholder, WidgetState } from '@livekit/components-core';
import {
  GridLayout,
  CarouselLayout,
  FocusLayout,
  FocusLayoutContainer,
  ParticipantTile,
  ControlBar,
  Chat,
  RoomAudioRenderer,
  ConnectionStateToast,
  useTracks,
  useRoomContext,
  LayoutContextProvider,
  useCreateLayoutContext,
} from '@livekit/components-react';
import AddStudentToCallButton from './AddStudentToCallButton';
import BackgroundBlurToggle from './BackgroundBlurToggle';
import MuteControls from './MuteControls';
import DeviceSwitcher, { useCycleCamera, useHasMultipleCameras } from './DeviceSwitcher';

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
}

/**
 * Strips the per-connection suffix from a LiveKit identity (`me@x.com#a1b2`).
 * The same person on a phone and a laptop is two participants with two
 * identities but one base — spotlight is about the person, so it matches on
 * the base. Muting stays per-connection and uses the full identity.
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

function CopyLinkButton({ sessionId }: { sessionId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const url = `${window.location.origin}/dashboard/session/${sessionId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [sessionId]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
      style={{
        background: copied ? '#10b981' : 'rgba(255,255,255,0.1)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.25)',
      }}
    >
      {copied ? 'Link copied' : 'Copy invite link'}
    </button>
  );
}

function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: 'speaker' | 'gallery';
  onChange: (mode: 'speaker' | 'gallery') => void;
}) {
  return (
    <div className="flex items-center rounded-md overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.25)' }}>
      {(['speaker', 'gallery'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className="px-2.5 py-1 text-[11px] font-semibold cursor-pointer capitalize transition-colors"
          style={{
            background: viewMode === mode ? '#10b981' : 'rgba(255,255,255,0.1)',
            color: '#fff',
          }}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

/**
 * A dedicated top bar, deliberately kept OUTSIDE the GridLayout/
 * ParticipantTile tree. Two different attempts at overlaying a button on
 * top of a tile (wrapping it in a div, then passing it as ParticipantTile's
 * children) each broke tile rendering in a different way — GridLayout's
 * sizing expects ParticipantTile to be its untouched direct child, and
 * ParticipantTile's `children` prop replaces its internal video/placeholder
 * content instead of layering on top of it. This sidesteps both.
 */
function TopBar({
  sessionId,
  isModerator,
  tracks,
  spotlightIdentity,
  onSpotlight,
  viewMode,
  onViewModeChange,
}: {
  sessionId: string;
  isModerator: boolean;
  tracks: { participant: { identity: string; name?: string } }[];
  spotlightIdentity: string | null;
  onSpotlight: (identity: string | null) => void;
  viewMode: 'speaker' | 'gallery';
  onViewModeChange: (mode: 'speaker' | 'gallery') => void;
}) {
  // Deduped by base identity so one person joined from two devices is a
  // single spotlight entry, not two.
  const seen = new Set<string>();
  const people = tracks.filter((t) => {
    const base = baseIdentity(t.participant.identity)!;
    if (seen.has(base)) return false;
    seen.add(base);
    return true;
  });

  return (
    // Absolutely positioned so it floats over the video area instead of
    // taking flex space — the grid/focus wrappers below size themselves via
    // a fixed calc() against the control bar height only, and would overflow
    // if this bar consumed layout space as a normal flex sibling.
    <div
      className="absolute top-0 left-0 right-0 z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-2"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isModerator && people.length > 0 && (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/50 mr-1">
              Spotlight:
            </span>
            {people.map((t) => {
              const identity = baseIdentity(t.participant.identity)!;
              const isSpotlighted = identity === baseIdentity(spotlightIdentity);
              return (
                <button
                  key={identity}
                  type="button"
                  onClick={() => onSpotlight(isSpotlighted ? null : identity)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
                  style={{
                    background: isSpotlighted ? '#10b981' : 'rgba(255,255,255,0.1)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.25)',
                  }}
                >
                  {isSpotlighted ? '★ ' : ''}
                  {t.participant.name || identity}
                </button>
              );
            })}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isModerator && <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />}
        <DeviceSwitcher />
        <BackgroundBlurToggle />
        <MuteControls sessionId={sessionId} isModerator={isModerator} />
        {isModerator && <AddStudentToCallButton sessionId={sessionId} />}
        <CopyLinkButton sessionId={sessionId} />
      </div>
    </div>
  );
}

/**
 * Tracks whether the *viewport* is portrait or landscape — a phone held
 * upright vs. a laptop/tablet/phone rotated sideways. Driving the self-view
 * box's aspect ratio off this (rather than a fixed landscape box) means a
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

/**
 * Small floating tile, draggable by pointer. Used for the teacher's own
 * self-view, and for other participants when a student has someone
 * spotlighted (they float instead of sitting in a fixed, non-movable
 * carousel strip). Kept as a standalone absolutely-positioned tile outside
 * GridLayout/FocusLayout entirely, so it can't trigger the same sizing
 * interference that broke tile rendering when a tile was wrapped or given
 * children (see the FocusLayoutContainer/CarouselLayout usage below, which
 * is deliberately left untouched rather than fought with directly).
 */
function DraggableTile({
  trackRef,
  defaultPosition,
  onTap,
}: {
  trackRef: TrackReferenceOrPlaceholder;
  defaultPosition: { right: number; bottom: number };
  /** Fired on a tap that wasn't a drag — used to flip the camera. */
  onTap?: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const orientation = useViewportOrientation();
  const boxSize = orientation === 'portrait' ? { width: 100, height: 168 } : { width: 168, height: 100 };
  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    startedAt: number;
    moved: number;
  }>({
    dragging: false,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    startedAt: 0,
    moved: 0,
  });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = elRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const elRect = el.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const currentPos = pos ?? { x: elRect.left - parentRect.left, y: elRect.top - parentRect.top };
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: currentPos.x,
      startPosY: currentPos.y,
      startedAt: Date.now(),
      moved: 0,
    };
    if (!pos) setPos(currentPos);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    dragState.current.moved = Math.max(dragState.current.moved, Math.abs(dx) + Math.abs(dy));
    setPos({ x: dragState.current.startPosX + dx, y: dragState.current.startPosY + dy });
  };

  const onPointerUp = () => {
    const { dragging, moved, startedAt } = dragState.current;
    dragState.current.dragging = false;
    // A tap and the start of a drag are the same gesture until the finger
    // moves, so only treat it as a tap if it barely moved and was quick.
    if (dragging && onTap && moved < 8 && Date.now() - startedAt < 500) {
      onTap();
    }
  };

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute z-40 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
      style={{
        width: boxSize.width,
        height: boxSize.height,
        ...(pos ? { left: pos.x, top: pos.y } : defaultPosition),
        border: '2px solid rgba(255,255,255,0.35)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        touchAction: 'none',
      }}
    >
      <ParticipantTile trackRef={trackRef} className="w-full h-full" />
      {onTap && (
        <span
          className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-semibold pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          🔄 Tap to flip
        </span>
      )}
    </div>
  );
}

export default function CustomVideoConference({ isModerator, sessionId }: CustomVideoConferenceProps) {
  const layoutContext = useCreateLayoutContext();
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare], {
    onlySubscribed: false,
  });
  const metadata = useLiveRoomMetadata();
  // Optimistic override so the moderator who clicked sees an instant result
  // instead of waiting on the metadata round-trip; cleared once the room's
  // own metadata event confirms the change (or any other change supersedes it).
  const [pendingSpotlight, setPendingSpotlight] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setPendingSpotlight(undefined);
  }, [metadata]);
  const spotlightIdentity =
    pendingSpotlight !== undefined ? pendingSpotlight : parseSpotlightIdentity(metadata);

  // Per-viewer layout choice, like Zoom/Meet's gallery vs speaker toggle —
  // local only, never synced, so each participant can pick independently.
  const [viewMode, setViewMode] = useState<'speaker' | 'gallery'>('speaker');

  // Mirrors the layout context's widget state (chat open/closed, unread
  // count) so the chat panel can be shown and hidden.
  const [widgetState, setWidgetState] = useState<WidgetState>({
    showChat: false,
    unreadMessages: 0,
    showSettings: false,
  });

  // Tapping your own picture-in-picture flips front/back camera, the way
  // every phone call app works. Only offered when there's a second camera.
  const cycleCamera = useCycleCamera();
  const hasMultipleCameras = useHasMultipleCameras();

  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && t.publication?.isSubscribed
  );
  const spotlightTrack = tracks.find(
    (t) => t.source === Track.Source.Camera && baseIdentity(t.participant.identity) === baseIdentity(spotlightIdentity)
  );
  const localCameraTrack = tracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera);

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
          // silent server-side failure here (e.g. host check mismatch)
          // would otherwise look like it worked (the host's own view never
          // reflects spotlight state) while students never see the change.
          if (!res.ok) {
            console.error('Spotlight update failed', res.status);
            setPendingSpotlight(undefined);
          }
        })
        .catch(() => setPendingSpotlight(undefined));
    },
    [sessionId]
  );

  // Screen share always wins for everyone. Otherwise: the teacher gets a
  // fixed "students in a grid + my own camera floating" layout regardless of
  // who's spotlighted (spotlight only affects what OTHER people see); a
  // student gets gallery (equal grid) or speaker (spotlighted teacher/
  // student big) depending on their own toggle.
  let mainTracks = tracks;
  let focusTrack: TrackReferenceOrPlaceholder | undefined;
  let selfViewTrack: TrackReferenceOrPlaceholder | undefined;

  if (screenShareTrack) {
    focusTrack = screenShareTrack;
  } else if (isModerator) {
    mainTracks = tracks.filter((t) => !(t.participant.isLocal && t.source === Track.Source.Camera));
    selfViewTrack = localCameraTrack;
  } else if (viewMode === 'speaker' && spotlightTrack) {
    focusTrack = spotlightTrack;
  }

  const carouselTracks = focusTrack
    ? mainTracks.filter(
        (t) => !(t.participant.identity === focusTrack!.participant.identity && t.source === focusTrack!.source)
      )
    : mainTracks;

  return (
    // The chat panel is a *sibling* of the video area inside
    // .lk-video-conference (a flex row), which is how LiveKit's own
    // VideoConference lays it out — the toggle in the control bar only
    // flips widget state, it doesn't render anything. Without this wrapper
    // and the <Chat> below, pressing Chat visibly did nothing at all.
    <LayoutContextProvider value={layoutContext} onWidgetChange={setWidgetState}>
      <div className="lk-video-conference" style={{ height: '100%' }}>
        <div className="lk-video-conference-inner" style={{ height: '100%', position: 'relative' }}>
          <TopBar
            sessionId={sessionId}
            isModerator={isModerator}
            tracks={tracks}
            spotlightIdentity={spotlightIdentity}
            onSpotlight={handleSpotlight}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
          {!focusTrack ? (
            <div className="lk-grid-layout-wrapper">
              <GridLayout tracks={mainTracks}>
                <ParticipantTile />
              </GridLayout>
            </div>
          ) : (
            <div className="lk-focus-layout-wrapper lk-carousel-hidden">
              <FocusLayoutContainer>
                <CarouselLayout tracks={carouselTracks}>
                  <ParticipantTile />
                </CarouselLayout>
                <FocusLayout trackRef={focusTrack} />
              </FocusLayoutContainer>
            </div>
          )}
          {/* Peers float as small draggable tiles instead of sitting in the
              fixed, non-movable carousel strip above (kept rendered but
              hidden via .lk-carousel-hidden — swapping it out entirely
              risks the same FocusLayoutContainer sizing issues documented
              on DraggableTile). Cascaded downward from the corner so they
              don't stack exactly on top of each other by default. */}
          {focusTrack &&
            carouselTracks.map((t, i) => (
              <DraggableTile
                key={`${t.participant.identity}-${t.source}`}
                trackRef={t}
                defaultPosition={{ right: 16, bottom: 84 + i * 116 }}
                onTap={
                  hasMultipleCameras && t.participant.isLocal && t.source === Track.Source.Camera
                    ? cycleCamera
                    : undefined
                }
              />
            ))}
          {selfViewTrack && (
            <DraggableTile
              trackRef={selfViewTrack}
              defaultPosition={{ right: 16, bottom: 84 }}
              onTap={hasMultipleCameras ? cycleCamera : undefined}
            />
          )}
          <ControlBar controls={{ chat: true, screenShare: true }} />
        </div>
        <Chat style={{ display: widgetState.showChat ? 'grid' : 'none' }} />
      </div>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LayoutContextProvider>
  );
}
