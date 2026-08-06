'use client';

/**
 * Background effects — blur and virtual wallpapers for your own camera.
 *
 * Runs entirely client-side on @livekit/track-processors (MediaPipe
 * segmentation), so nothing is uploaded and no server work is involved.
 *
 * Split into a hook + a content component on purpose: the hook owns the
 * processor and lives in the control bar, which stays mounted for the whole
 * call, so opening and closing the panel never tears the effect down.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { useLocalParticipant } from '@livekit/components-react';
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
  type SwitchBackgroundProcessorOptions,
} from '@livekit/track-processors';

export interface Wallpaper {
  id: string;
  label: string;
  path: string;
}

/** Hand-drawn SVG scenes — a few KB each, and they scale to any camera size. */
export const WALLPAPERS: Wallpaper[] = [
  { id: 'arches', label: 'Arches', path: '/backgrounds/arches.svg' },
  { id: 'masjid', label: 'Dusk Masjid', path: '/backgrounds/masjid.svg' },
  { id: 'library', label: 'Library', path: '/backgrounds/library.svg' },
  { id: 'study', label: 'Study', path: '/backgrounds/study.svg' },
  { id: 'classroom', label: 'Classroom', path: '/backgrounds/classroom.svg' },
  { id: 'office', label: 'Office', path: '/backgrounds/office.svg' },
  { id: 'mountains', label: 'Dawn Peaks', path: '/backgrounds/mountains.svg' },
  { id: 'sunset', label: 'Sunset Sea', path: '/backgrounds/sunset.svg' },
  { id: 'bokeh', label: 'City Lights', path: '/backgrounds/bokeh.svg' },
  { id: 'sage', label: 'Sage', path: '/backgrounds/sage.svg' },
  { id: 'charcoal', label: 'Charcoal', path: '/backgrounds/charcoal.svg' },
];

export type EffectSelection =
  | { kind: 'none' }
  | { kind: 'blur'; radius: number }
  | { kind: 'image'; id: string };

export interface BackgroundEffects {
  supported: boolean;
  busy: boolean;
  selection: EffectSelection;
  /** True whenever anything other than "none" is applied. */
  active: boolean;
  select: (next: EffectSelection) => void;
}

export function useBackgroundEffects(): BackgroundEffects {
  const { localParticipant } = useLocalParticipant();
  const [selection, setSelection] = useState<EffectSelection>({ kind: 'none' });
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);

  useEffect(() => {
    setSupported(supportsBackgroundProcessors());
  }, []);

  // Re-apply after the camera track is republished (camera toggled off and
  // back on, or a device switch) — a fresh LocalVideoTrack carries no
  // processor even though the user still expects their effect to be on.
  useEffect(() => {
    if (selection.kind === 'none') return;
    const pub = localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track as LocalVideoTrack | undefined;
    if (track && processorRef.current && track.getProcessor() !== processorRef.current) {
      track.setProcessor(processorRef.current).catch(() => {});
    }
  }, [selection, localParticipant]);

  const select = useCallback(
    (next: EffectSelection) => {
      const pub = localParticipant.getTrackPublication(Track.Source.Camera);
      const track = pub?.track as LocalVideoTrack | undefined;

      // Remember the choice even with the camera off, so turning the camera
      // back on restores it via the effect above.
      setSelection(next);
      if (!track) return;

      const target: SwitchBackgroundProcessorOptions =
        next.kind === 'none'
          ? { mode: 'disabled' }
          : next.kind === 'blur'
            ? { mode: 'background-blur', blurRadius: next.radius }
            : {
                mode: 'virtual-background',
                imagePath: WALLPAPERS.find((w) => w.id === next.id)?.path ?? '',
              };

      setBusy(true);
      (async () => {
        try {
          if (target.mode === 'disabled') {
            if (processorRef.current) await track.stopProcessor();
            processorRef.current = null;
            return;
          }
          if (processorRef.current) {
            await processorRef.current.switchTo(target);
          } else {
            const processor = BackgroundProcessor(target);
            await track.setProcessor(processor);
            processorRef.current = processor;
          }
        } catch (err) {
          console.error('Background effect failed', err);
        } finally {
          setBusy(false);
        }
      })();
    },
    [localParticipant]
  );

  return {
    supported,
    busy,
    selection,
    active: selection.kind !== 'none',
    select,
  };
}

function Swatch({
  active,
  onClick,
  label,
  style,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="relative aspect-video w-full rounded-lg overflow-hidden cursor-pointer bg-cover bg-center flex items-center justify-center"
      style={{
        outline: active ? '2px solid #8ab4f8' : '1px solid rgba(255,255,255,0.14)',
        outlineOffset: '-1px',
        ...style,
      }}
    >
      {children}
      <span
        className="absolute inset-x-0 bottom-0 px-1 py-0.5 text-[9px] font-medium truncate"
        style={{ background: 'rgba(0,0,0,0.5)', color: '#fff' }}
      >
        {label}
      </span>
    </button>
  );
}

export function BackgroundEffectsContent({ effects }: { effects: BackgroundEffects }) {
  const { selection, select, supported, busy } = effects;

  if (!supported) {
    return (
      <div className="px-4 py-4 text-sm text-white/60">
        This browser can&apos;t run background effects.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3">
      <div className="px-1 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/45">
        Effects {busy && <span className="normal-case font-normal">· applying…</span>}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        <Swatch
          label="None"
          active={selection.kind === 'none'}
          onClick={() => select({ kind: 'none' })}
          style={{ background: '#2a2d33' }}
        />
        <Swatch
          label="Slight blur"
          active={selection.kind === 'blur' && selection.radius <= 6}
          onClick={() => select({ kind: 'blur', radius: 5 })}
          style={{ background: 'linear-gradient(135deg,#3d4149,#5a606b)' }}
        />
        <Swatch
          label="Blur"
          active={selection.kind === 'blur' && selection.radius > 6}
          onClick={() => select({ kind: 'blur', radius: 15 })}
          style={{ background: 'linear-gradient(135deg,#4a4f59,#7c838f)' }}
        />
        {WALLPAPERS.map((w) => (
          <Swatch
            key={w.id}
            label={w.label}
            active={selection.kind === 'image' && selection.id === w.id}
            onClick={() => select({ kind: 'image', id: w.id })}
            style={{ backgroundImage: `url(${w.path})` }}
          />
        ))}
      </div>
    </div>
  );
}
