'use client';

/**
 * Per-student volume — the quiet alternative to muting somebody.
 *
 * The case it exists for: the teacher has finished with one student and moves
 * on to the next, but wants the first to keep reciting out loud rather than
 * sitting silent. Muting them would stop that. Turning them down lets them
 * carry on while the class listens to somebody else.
 *
 * It is **room-wide, not per-listener**. The teacher drags it and everyone in
 * the class hears the change, which is why the value lives in the room's
 * metadata and is written through a host-only API rather than being kept in
 * this component. That is also why only a moderator ever sees this control.
 *
 * The range stops at 100%: `RemoteParticipant.setVolume` ends up on
 * `HTMLMediaElement.volume`, which clamps at 1, so a "boost" would move the
 * handle and change nothing.
 */

import { useEffect, useRef, useState } from 'react';
import { VolumeIcon, VolumeOffIcon } from './CallIcons';

/** Long enough to swallow a drag, short enough that the room keeps up with it. */
const COMMIT_DEBOUNCE_MS = 250;

export default function VolumeSlider({
  value,
  onChange,
  label,
  compact = false,
}: {
  /** 0–1. Comes from room metadata; 1 when the teacher hasn't touched it. */
  value: number;
  /** Called with the settled value, already debounced. */
  onChange: (volume: number) => void;
  label: string;
  /** Tighter layout for the People panel row, where space is at a premium. */
  compact?: boolean;
}) {
  // Dragging has to feel immediate, but the truth is a round-trip through the
  // room away. Hold a local value while the user is on the handle and let the
  // room's own value take over again once it has caught up — the same shape
  // as the optimistic spotlight in CustomVideoConference.
  const [dragging, setDragging] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // A value arriving from the room means our own change (or somebody else's)
  // has landed; stop overriding it.
  useEffect(() => {
    setDragging(null);
  }, [value]);

  const shown = dragging ?? value;
  const percent = Math.round(shown * 100);

  const handleInput = (next: number) => {
    setDragging(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), COMMIT_DEBOUNCE_MS);
  };

  return (
    <div
      className={`flex items-center gap-2 ${compact ? '' : 'px-3.5 py-2'}`}
      // The icon is drawn in `currentColor`. The tile's ⋮ menu sets no colour
      // on its container, so without this it inherited near-black on a
      // near-black panel and simply wasn't there.
      style={{ color: 'rgba(255,255,255,0.75)' }}
      // Dragging the handle must not close the tile's ⋮ menu (which dismisses
      // on any mousedown outside itself) nor start dragging the floating tile
      // underneath.
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {percent === 0 ? (
        <VolumeOffIcon className="w-4 h-4 shrink-0" />
      ) : (
        <VolumeIcon className="w-4 h-4 shrink-0" />
      )}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-label={`Volume for ${label}`}
        onChange={(e) => handleInput(Number(e.target.value) / 100)}
        className="flex-1 min-w-0 cursor-pointer"
        style={{ accentColor: '#8ab4f8', height: 4 }}
      />
      <span
        className="text-[11px] tabular-nums shrink-0 text-right"
        style={{ color: 'rgba(255,255,255,0.65)', width: 32 }}
      >
        {percent}%
      </span>
    </div>
  );
}
