'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RoomEvent, Track } from 'livekit-client';
import type { TrackReferenceOrPlaceholder } from '@livekit/components-core';
import {
  GridLayout,
  CarouselLayout,
  FocusLayout,
  FocusLayoutContainer,
  ParticipantTile,
  ControlBar,
  RoomAudioRenderer,
  ConnectionStateToast,
  useTracks,
  useRoomContext,
  LayoutContextProvider,
  useCreateLayoutContext,
} from '@livekit/components-react';

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
  const seen = new Set<string>();
  const people = tracks.filter((t) => {
    if (seen.has(t.participant.identity)) return false;
    seen.add(t.participant.identity);
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
              const identity = t.participant.identity;
              const isSpotlighted = identity === spotlightIdentity;
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
        <CopyLinkButton sessionId={sessionId} />
      </div>
    </div>
  );
}

/**
 * Small floating self-view, draggable by pointer — the teacher's own camera
 * stays out of the way of the student grid instead of taking an equal tile.
 * Kept as a standalone absolutely-positioned tile outside GridLayout/
 * FocusLayout entirely, so it can't trigger the same sizing interference
 * that broke tile rendering when a tile was wrapped or given children.
 */
function DraggableSelfView({ trackRef }: { trackRef: TrackReferenceOrPlaceholder }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ dragging: boolean; startX: number; startY: number; startPosX: number; startPosY: number }>({
    dragging: false,
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
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
    };
    if (!pos) setPos(currentPos);
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.dragging) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPos({ x: dragState.current.startPosX + dx, y: dragState.current.startPosY + dy });
  };

  const onPointerUp = () => {
    dragState.current.dragging = false;
  };

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="absolute z-40 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing"
      style={{
        width: 160,
        height: 120,
        ...(pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 84 }),
        border: '2px solid rgba(255,255,255,0.35)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        touchAction: 'none',
      }}
    >
      <ParticipantTile trackRef={trackRef} />
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

  const screenShareTrack = tracks.find(
    (t) => t.source === Track.Source.ScreenShare && t.publication?.isSubscribed
  );
  const spotlightTrack = tracks.find(
    (t) => t.source === Track.Source.Camera && t.participant.identity === spotlightIdentity
  );
  const localCameraTrack = tracks.find((t) => t.participant.isLocal && t.source === Track.Source.Camera);

  const handleSpotlight = useCallback(
    (identity: string | null) => {
      setPendingSpotlight(identity);
      fetch(`/api/sessions/${sessionId}/spotlight`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity }),
      }).catch(() => setPendingSpotlight(undefined));
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
    <LayoutContextProvider value={layoutContext}>
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
          <div className="lk-focus-layout-wrapper">
            <FocusLayoutContainer>
              <CarouselLayout tracks={carouselTracks}>
                <ParticipantTile />
              </CarouselLayout>
              <FocusLayout trackRef={focusTrack} />
            </FocusLayoutContainer>
          </div>
        )}
        {selfViewTrack && <DraggableSelfView trackRef={selfViewTrack} />}
        <ControlBar controls={{ chat: true, screenShare: true }} />
      </div>
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LayoutContextProvider>
  );
}
