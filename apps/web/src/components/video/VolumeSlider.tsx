'use client';

/**
 * Per-student volume slider — room-wide gain control for the teacher.
 */

import { useEffect, useRef, useState } from 'react';
import { VolumeIcon, VolumeOffIcon } from './CallIcons';

const COMMIT_DEBOUNCE_MS = 250;

export default function VolumeSlider({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: number;
  onChange: (volume: number) => void;
  label: string;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

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
      className={`flex items-center gap-2.5 ${compact ? '' : 'px-3.5 py-2'}`}
      style={{ color: 'rgba(255,255,255,0.85)' }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {percent === 0 ? (
        <VolumeOffIcon className="w-4 h-4 shrink-0 text-red-400" />
      ) : (
        <VolumeIcon className="w-4 h-4 shrink-0 text-blue-400" />
      )}
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        aria-label={`Volume for ${label}`}
        onChange={(e) => handleInput(Number(e.target.value) / 100)}
        className="flex-1 min-w-0 cursor-pointer h-1.5 rounded-full bg-white/20 accent-blue-500"
      />
      <span
        className="text-[11px] font-semibold tabular-nums shrink-0 text-right text-neutral-300 w-8"
      >
        {percent}%
      </span>
    </div>
  );
}
