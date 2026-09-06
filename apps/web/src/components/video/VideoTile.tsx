'use client';

/**
 * Video tile — Modern Apple iOS FaceTime design language:
 * Continuous squircle rounded corners, radiant emerald active speaker indicator,
 * frosted glass metadata pills, vibrant gradient initials avatar, and glassmorphic
 * portalled context menu.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Track } from 'livekit-client';
import { isTrackReference, type TrackReferenceOrPlaceholder } from '@livekit/components-core';
import { VideoTrack, useIsSpeaking } from '@livekit/components-react';
import { MicOffIcon, SpeakingBarsIcon } from './CallIcons';
import VolumeSlider from './VolumeSlider';

const MENU_WIDTH = 240;

export interface TileActions {
  onSpotlight?: () => void;
  onMute?: () => void;
  onAskToUnmute?: () => void;
  onCameraOff?: () => void;
  onAskForCamera?: () => void;
  onRename?: (name: string) => void;
  onRemove?: () => void;
  volume?: number;
  onVolume?: (volume: number) => void;
}

export default function VideoTile({
  trackRef,
  name,
  micMuted,
  cameraOff,
  isLocal,
  isSpotlighted,
  handRaised,
  actions,
  volume,
  rounded = true,
  fit = 'contain',
}: {
  trackRef: TrackReferenceOrPlaceholder;
  name: string;
  micMuted: boolean;
  cameraOff: boolean;
  isLocal: boolean;
  isSpotlighted?: boolean;
  handRaised?: boolean;
  actions?: TileActions;
  volume?: number;
  rounded?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState(name);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setMenuOpen(false);
      setRenaming(false);
      setConfirmRemove(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('touchstart', close, true);
    window.addEventListener('mousedown', close, true);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('touchstart', close, true);
      window.removeEventListener('mousedown', close, true);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen) return;

    const place = () => {
      const btn = buttonRef.current?.getBoundingClientRect();
      if (!btn) return;
      const margin = 8;
      const width = Math.min(MENU_WIDTH, window.innerWidth - margin * 2);
      const height = menuRef.current?.offsetHeight ?? 260;

      let left = btn.left;
      left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);

      let top = btn.bottom + 6;
      if (top + height > window.innerHeight - margin) {
        top = Math.max(margin, Math.min(btn.top - 6 - height, window.innerHeight - height - margin));
      }

      setMenuPos({ top, left });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [menuOpen, renaming, confirmRemove]);

  const isSpeaking = useIsSpeaking(trackRef.participant) && !micMuted;
  const hasVideo = isTrackReference(trackRef) && !cameraOff;
  const hasActions =
    !!actions &&
    !!(actions.onSpotlight ||
      actions.onMute ||
      actions.onAskToUnmute ||
      actions.onCameraOff ||
      actions.onAskForCamera ||
      actions.onRename ||
      actions.onVolume ||
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

  const isScreenShare =
    isTrackReference(trackRef) &&
    (trackRef.source === Track.Source.ScreenShare ||
      trackRef.publication?.source === Track.Source.ScreenShare);

  const effectiveVolume = volume !== undefined ? volume : (actions?.volume ?? 1);

  return (
    <div
      ref={rootRef}
      className={`group relative w-full h-full overflow-hidden transition-all duration-200 ${
        rounded ? 'rounded-2xl sm:rounded-3xl' : ''
      }`}
      style={{
        background: '#0d0f14',
        outline: isSpotlighted ? '2.5px solid #007aff' : undefined,
        outlineOffset: '-2px',
        boxShadow: isSpeaking
          ? 'inset 0 0 0 2.5px #34c98a, 0 0 20px rgba(52, 201, 138, 0.45)'
          : isSpotlighted
            ? '0 0 24px rgba(0, 122, 255, 0.35)'
            : '0 4px 16px rgba(0, 0, 0, 0.4)',
      }}
    >
      {hasVideo ? (
        <VideoTrack
          trackRef={trackRef}
          className="w-full h-full"
          style={{
            objectFit: fit,
            transform: isLocal && !isScreenShare ? 'scaleX(-1)' : undefined,
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-neutral-900 to-black">
          <div
            className="rounded-full flex items-center justify-center font-bold text-white transition-all duration-200"
            style={{
              width: '24%',
              aspectRatio: '1',
              minWidth: 46,
              maxWidth: 104,
              background: 'linear-gradient(135deg, #007aff 0%, #0040dd 100%)',
              fontSize: 'clamp(1.2rem, 3.5vw, 2.2rem)',
              border: '1.5px solid rgba(255, 255, 255, 0.3)',
              boxShadow: isSpeaking
                ? '0 0 0 3px #34c98a, 0 0 20px rgba(52, 201, 138, 0.6)'
                : '0 10px 24px rgba(0, 0, 0, 0.35)',
            }}
          >
            {(name || '?').charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Frosted glass name & mic state capsule */}
      <div
        className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full max-w-[85%] z-10"
        style={{
          background: 'rgba(18, 20, 26, 0.76)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
        }}
      >
        {micMuted && <MicOffIcon className="w-3.5 h-3.5 shrink-0 text-red-400" />}
        {isSpeaking && (
          <span className="shrink-0 flex text-emerald-400">
            <SpeakingBarsIcon className="w-3.5 h-3.5" />
          </span>
        )}
        <span
          className="text-xs font-medium text-white truncate"
          style={{ color: micMuted ? '#fca5a5' : isSpeaking ? '#6ee7b7' : '#f3f4f6' }}
        >
          {name}
          {isLocal ? ' (you)' : ''}
        </span>
        {/* Lobby-wide synchronized volume attenuation badge */}
        {effectiveVolume < 0.98 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold font-mono ml-0.5 bg-blue-500/25 text-blue-300 border border-blue-400/30 flex items-center gap-0.5 shadow-sm"
            title={`Volume attenuated to ${Math.round(effectiveVolume * 100)}% for whole classroom`}
          >
            <span>{effectiveVolume <= 0.05 ? '🔇' : '🔉'}</span>
            <span>{Math.round(effectiveVolume * 100)}%</span>
          </span>
        )}
      </div>

      {handRaised && (
        <div
          className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 z-10 animate-bounce"
          style={{
            background: 'rgba(245, 158, 11, 0.95)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(245, 158, 11, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.35)',
          }}
        >
          <span>✋</span>
          <span className="text-[11px] font-bold">Hand Raised</span>
        </div>
      )}

      {isSpotlighted && (
        <div
          className={`absolute top-2.5 ${handRaised ? 'left-32' : 'left-2.5'} px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide flex items-center gap-1 z-10`}
          style={{
            background: 'linear-gradient(135deg, #007aff 0%, #0056b3 100%)',
            color: '#fff',
            boxShadow: '0 2px 8px rgba(0, 122, 255, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
          }}
        >
          ★ Spotlight
        </div>
      )}

      {/* Top-Right Zoom Action Buttons (Ask to Unmute / Unmute + ... More Menu) */}
      <div
        className={`absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20 transition-opacity duration-200 ${
          menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
        }`}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isLocal ? (
          actions?.onRename && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRenaming(true);
                openMenu();
              }}
              className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-md transition-all cursor-pointer"
            >
              Rename
            </button>
          )
        ) : (
          <>
            {micMuted && actions?.onAskToUnmute && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onAskToUnmute?.();
                }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-md transition-all cursor-pointer"
              >
                Ask to Unmute
              </button>
            )}
            {!micMuted && actions?.onMute && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.onMute?.();
                }}
                className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-md transition-all cursor-pointer"
              >
                Mute
              </button>
            )}
          </>
        )}

        {/* Blue [...] More Menu Button */}
        {hasActions && (
          <button
            ref={buttonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openMenu();
            }}
            aria-label={`Options for ${name}`}
            className="w-7 h-6 sm:w-8 sm:h-7 rounded-md flex items-center justify-center font-bold text-white bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-md transition-all cursor-pointer text-xs"
          >
            ⋯
          </button>
        )}
      </div>

      {hasActions && (
        <>
          {menuOpen && typeof document !== 'undefined' && createPortal(
            <>
              <div
                className="fixed inset-0 z-[79]"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setRenaming(false);
                  setConfirmRemove(false);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                  setRenaming(false);
                  setConfirmRemove(false);
                }}
              />
              <div
                ref={menuRef}
                className="fixed z-[80] rounded-3xl overflow-hidden"
                style={{
                  top: menuPos?.top ?? -9999,
                  left: menuPos?.left ?? -9999,
                  width: `min(${MENU_WIDTH}px, calc(100vw - 16px))`,
                  visibility: menuPos ? 'visible' : 'hidden',
                  background: 'rgba(24, 26, 32, 0.90)',
                  backdropFilter: 'blur(28px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(28px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  boxShadow: '0 20px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
              {renaming ? (
                <div className="p-3">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-white/10 text-white border border-white/20 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={submitRename}
                      className="flex-1 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{ background: '#007aff', color: '#fff' }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setRenaming(false)}
                      className="flex-1 py-1.5 rounded-xl text-xs font-medium cursor-pointer bg-white/10 text-white hover:bg-white/15"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-2">
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

                  {actions?.onVolume && (
                    <>
                      <div className="my-1 border-t border-white/10" />
                      <div className="px-3.5 pt-1 pb-2">
                        <div className="pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                          Volume for everyone
                        </div>
                        <VolumeSlider
                          value={actions.volume ?? 1}
                          onChange={(v) => actions.onVolume?.(v)}
                          label={name}
                          compact
                        />
                      </div>
                    </>
                  )}

                  {actions?.onRemove && (
                    <>
                      <div className="my-1 border-t border-white/10" />
                      {confirmRemove ? (
                        <div className="px-2.5 pb-1">
                          <button
                            type="button"
                            onClick={() => {
                              actions.onRemove?.();
                              setConfirmRemove(false);
                              setMenuOpen(false);
                            }}
                            className="w-full py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                            style={{ background: '#ff3b30', color: '#fff' }}
                          >
                            Remove {name}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRemove(false)}
                            className="w-full mt-1.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer bg-white/10 text-white"
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
            </>,
            document.body
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
      className={`w-full text-left px-4 py-2 text-xs font-medium cursor-pointer transition-colors ${
        danger ? 'text-red-400 hover:bg-red-500/15' : 'text-neutral-200 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  );
}
