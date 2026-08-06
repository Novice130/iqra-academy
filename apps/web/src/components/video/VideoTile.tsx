'use client';

/**
 * Video tile — one participant, with their controls on the tile itself the
 * way Zoom does it: mic state is always visible, and the host's actions
 * (mute, camera off, rename, spotlight) live behind a ⋮ on the tile rather
 * than in a separate panel you have to go hunting for.
 *
 * This is deliberately our own tile rather than LiveKit's `ParticipantTile`.
 * That component's `children` prop *replaces* its internals rather than
 * layering over them, and wrapping it in a positioned div breaks
 * `GridLayout`'s sizing — both were tried before. Owning the tile outright
 * is simpler than fighting either behaviour.
 */

import { useEffect, useRef, useState } from 'react';
import { isTrackReference, type TrackReferenceOrPlaceholder } from '@livekit/components-core';
import { VideoTrack } from '@livekit/components-react';
import { MicOffIcon, MoreIcon } from './CallIcons';

export interface TileActions {
  /** Host-only. Absent for students, and for your own tile. */
  onSpotlight?: () => void;
  onMute?: () => void;
  onAskToUnmute?: () => void;
  onCameraOff?: () => void;
  /** LiveKit can force a camera *off* but never back on — this asks. */
  onAskForCamera?: () => void;
  onRename?: (name: string) => void;
  /** Drops them from the call. Asks for confirmation first — it's abrupt. */
  onRemove?: () => void;
}

export default function VideoTile({
  trackRef,
  name,
  micMuted,
  cameraOff,
  isLocal,
  isSpotlighted,
  actions,
  rounded = true,
  fit = 'contain',
}: {
  trackRef: TrackReferenceOrPlaceholder;
  name: string;
  micMuted: boolean;
  cameraOff: boolean;
  isLocal: boolean;
  isSpotlighted?: boolean;
  actions?: TileActions;
  rounded?: boolean;
  /**
   * `contain` shows the whole frame and letterboxes — the right default for
   * a main tile, because a phone publishes a tall 9:16 stream and `cover`
   * crops it down to a slice of somebody's neck on a widescreen monitor.
   * `cover` is kept for the small floating tiles, where filling the box
   * matters more than seeing every pixel.
   */
  fit?: 'cover' | 'contain';
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState(name);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
        setRenaming(false);
        setConfirmRemove(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const hasVideo = isTrackReference(trackRef) && !cameraOff;
  const hasActions =
    !!actions &&
    !!(actions.onSpotlight ||
      actions.onMute ||
      actions.onAskToUnmute ||
      actions.onCameraOff ||
      actions.onAskForCamera ||
      actions.onRename ||
      actions.onRemove);

  const submitRename = () => {
    const next = draft.trim();
    setRenaming(false);
    setMenuOpen(false);
    if (next && next !== name) actions?.onRename?.(next);
  };

  const openMenu = () => {
    setDraft(name);
    setConfirmRemove(false);
    setMenuOpen((v) => !v);
  };

  return (
    <div
      ref={rootRef}
      className={`relative w-full h-full overflow-hidden ${rounded ? 'rounded-xl' : ''}`}
      style={{
        background: '#0b0c0f',
        outline: isSpotlighted ? '2px solid #8ab4f8' : undefined,
        outlineOffset: '-2px',
      }}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className="w-full h-full"
          // Mirror your own camera only — everyone else should look the way
          // they actually look.
          style={{ objectFit: fit, transform: isLocal ? 'scaleX(-1)' : undefined }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <div
            className="rounded-full flex items-center justify-center font-semibold text-white"
            style={{ width: '22%', aspectRatio: '1', minWidth: 40, maxWidth: 96, background: '#3c4043', fontSize: '1.4em' }}
          >
            {(name || '?').charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Name + mic state, always visible — not tucked into a panel. */}
      <div
        className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md max-w-[85%]"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        {micMuted && <MicOffIcon className="w-3.5 h-3.5 shrink-0" />}
        <span className="text-[11px] text-white truncate" style={{ color: micMuted ? '#f6a6a0' : '#fff' }}>
          {name}
          {isLocal ? ' (you)' : ''}
        </span>
      </div>

      {isSpotlighted && (
        <div
          className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ background: 'rgba(138,180,248,0.9)', color: '#202124' }}
        >
          ★ Spotlight
        </div>
      )}

      {hasActions && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMenu();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Options for ${name}`}
            className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
            style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
          >
            <MoreIcon className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div
              // Fixed width, not min-width: shrink-to-fit on an absolutely
              // positioned box resolved to ~520px here, which left a short
              // label like "Rename…" swimming in empty space.
              className="absolute top-11 right-2 z-30 w-[220px] rounded-2xl overflow-hidden"
              style={{
                background: '#26282c',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {renaming ? (
                <div className="p-2">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    className="w-full px-2.5 py-2 rounded-lg text-sm"
                    style={{ background: '#2a2d33', color: '#e8eaed', border: '1px solid rgba(255,255,255,0.14)' }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={submitRename}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ background: '#8ab4f8', color: '#202124' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setRenaming(false)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.1)', color: '#e8eaed' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-1.5">
                  {actions?.onSpotlight && (
                    <MenuItem
                      label={isSpotlighted ? 'Remove spotlight' : 'Spotlight for everyone'}
                      onClick={() => {
                        actions.onSpotlight?.();
                        setMenuOpen(false);
                      }}
                    />
                  )}
                  {micMuted
                    ? actions?.onAskToUnmute && (
                        <MenuItem
                          label="Ask to unmute"
                          onClick={() => {
                            actions.onAskToUnmute?.();
                            setMenuOpen(false);
                          }}
                        />
                      )
                    : actions?.onMute && (
                        <MenuItem
                          label="Mute microphone"
                          onClick={() => {
                            actions.onMute?.();
                            setMenuOpen(false);
                          }}
                        />
                      )}
                  {cameraOff
                    ? actions?.onAskForCamera && (
                        <MenuItem
                          label="Ask to turn on camera"
                          onClick={() => {
                            actions.onAskForCamera?.();
                            setMenuOpen(false);
                          }}
                        />
                      )
                    : actions?.onCameraOff && (
                        <MenuItem
                          label="Turn off camera"
                          onClick={() => {
                            actions.onCameraOff?.();
                            setMenuOpen(false);
                          }}
                        />
                      )}
                  {actions?.onRename && <MenuItem label="Rename…" onClick={() => setRenaming(true)} />}

                  {/* Two taps, not a browser confirm(): the dialog steals
                      focus from the call and reads as a page error on a
                      phone. Kicking someone out of a lesson by a mis-tap is
                      the thing worth preventing. */}
                  {actions?.onRemove && (
                    <>
                      <div className="my-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} />
                      {confirmRemove ? (
                        <div className="px-2 pb-1">
                          <button
                            type="button"
                            onClick={() => {
                              actions.onRemove?.();
                              setConfirmRemove(false);
                              setMenuOpen(false);
                            }}
                            className="w-full py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                            style={{ background: '#ea4335', color: '#fff' }}
                          >
                            Remove {name}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(false)}
                            className="w-full mt-1.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                            style={{ background: 'rgba(255,255,255,0.1)', color: '#e8eaed' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <MenuItem
                          label="Remove from meeting"
                          danger
                          onClick={() => setConfirmRemove(true)}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left px-3.5 py-2 text-[13px] leading-5 cursor-pointer hover:bg-white/10 transition-colors"
      style={{ color: danger ? '#f6a6a0' : '#e8eaed' }}
    >
      {label}
    </button>
  );
}
