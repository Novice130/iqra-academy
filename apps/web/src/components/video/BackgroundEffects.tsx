'use client';

/**
 * Background effects — blur and virtual wallpapers for your own camera.
 *
 * Runs entirely client-side on MediaPipe segmentation, so nothing is uploaded
 * and no server work is involved. The pipeline is ours rather than
 * `@livekit/track-processors`' — see `segmentation/glPipeline.ts` for what
 * theirs does to the mask and why the edges looked the way they did.
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
  supportsBackgroundEffects,
  type BackgroundEffectOptions,
} from './segmentation';

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

/**
 * The chosen background is remembered across calls — a teacher who always
 * teaches against the Arches shouldn't have to pick it every lesson. Stored
 * per browser (localStorage), not per account: it describes this device's
 * camera setup, and a teacher on a phone may reasonably want something
 * different from their desk.
 */
const STORAGE_KEY = 'nt.background-effect';

export function loadSavedEffect(): EffectSelection | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as EffectSelection;
    if (parsed?.kind === 'none') return parsed;
    if (parsed?.kind === 'blur' && typeof parsed.radius === 'number') return parsed;
    // Drop a wallpaper that no longer exists rather than failing to apply it.
    if (parsed?.kind === 'image' && WALLPAPERS.some((w) => w.id === parsed.id)) return parsed;
  } catch {
    // Corrupt or unavailable storage — fall back to no effect.
  }
  return undefined;
}

function saveEffect(selection: EffectSelection) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // Private mode / storage full — the effect still applies for this call.
  }
}

/** Turns a selection into the processor options the track expects. */
export function toProcessorOptions(next: EffectSelection): BackgroundEffectOptions {
  if (next.kind === 'none') return { mode: 'disabled' };
  if (next.kind === 'blur') return { mode: 'background-blur', blurRadius: next.radius };
  return {
    mode: 'virtual-background',
    imagePath: WALLPAPERS.find((w) => w.id === next.id)?.path ?? '',
  };
}

export function useBackgroundEffects(initial?: EffectSelection): BackgroundEffects {
  // The pre-join choice wins; otherwise fall back to whatever was used last.
  // cameraTrack (not just localParticipant) is the dependency that actually
  // changes when the camera track is published or republished. Keying the
  // effect off localParticipant alone meant a background chosen on the
  // pre-join screen was remembered but never applied: at mount there is no
  // published track yet, and nothing re-ran once there was one.
  const { localParticipant, cameraTrack } = useLocalParticipant();
  // Lazy: loadSavedEffect() touches localStorage, so passing it eagerly ran a
  // getItem + JSON.parse on every render of the conference.
  const [selection, setSelection] = useState<EffectSelection>(
    () => initial ?? loadSavedEffect() ?? { kind: 'none' }
  );
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const processorRef = useRef<BackgroundProcessor | null>(null);

  useEffect(() => {
    setSupported(supportsBackgroundEffects());
  }, []);

  // Keeps the effect attached to whatever camera track is currently live.
  // Two cases: the effect was chosen on the pre-join screen and there was no
  // room track yet, and the track being republished (camera toggled off and
  // on, or a device switch) — a fresh LocalVideoTrack carries no processor
  // even though the user still expects their effect to be on.
  useEffect(() => {
    if (selection.kind === 'none') return;
    const track = (cameraTrack?.track ??
      localParticipant.getTrackPublication(Track.Source.Camera)?.track) as LocalVideoTrack | undefined;
    if (!track) return;

    if (!processorRef.current) {
      const processor = new BackgroundProcessor(toProcessorOptions(selection));
      processorRef.current = processor;
      track.setProcessor(processor).catch(() => {});
      return;
    }
    if (track.getProcessor() !== processorRef.current) {
      track.setProcessor(processorRef.current).catch(() => {});
    }
  }, [selection, cameraTrack, localParticipant]);

  const select = useCallback(
    (next: EffectSelection) => {
      const track = (cameraTrack?.track ??
        localParticipant.getTrackPublication(Track.Source.Camera)?.track) as LocalVideoTrack | undefined;

      // Remember the choice even with the camera off, so turning the camera
      // back on restores it via the effect above — and remember it for the
      // next class too.
      setSelection(next);
      saveEffect(next);
      if (!track) return;

      const target = toProcessorOptions(next);

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
            const processor = new BackgroundProcessor(target);
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
    [cameraTrack, localParticipant]
  );

  return {
    supported,
    busy,
    selection,
    active: selection.kind !== 'none',
    select,
  };
}

/**
 * Same contract as useBackgroundEffects, but for a track that isn't in a
 * room yet — the pre-join preview. Lets someone pick their background before
 * anyone sees them, which is the whole point of a pre-join screen.
 */
export function usePreviewBackgroundEffects(track: LocalVideoTrack | null): BackgroundEffects {
  // Opens on whatever was used last, so the preview already looks the way
  // the class will.
  const [selection, setSelection] = useState<EffectSelection>(() => loadSavedEffect() ?? { kind: 'none' });
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const processorRef = useRef<BackgroundProcessor | null>(null);

  useEffect(() => {
    setSupported(supportsBackgroundEffects());
  }, []);

  // The preview track is recreated whenever the camera or device changes, so
  // the processor has to be re-attached to the new one.
  useEffect(() => {
    processorRef.current = null;
    if (!track || selection.kind === 'none') return;
    const processor = new BackgroundProcessor(toProcessorOptions(selection));
    processorRef.current = processor;
    track.setProcessor(processor).catch(() => {});
    // Only re-run for a genuinely new track; selection changes go through select().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const select = useCallback(
    (next: EffectSelection) => {
      setSelection(next);
      saveEffect(next);
      if (!track) return;
      const target = toProcessorOptions(next);
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
            const processor = new BackgroundProcessor(target);
            await track.setProcessor(processor);
            processorRef.current = processor;
          }
        } catch (err) {
          console.error('Preview background effect failed', err);
        } finally {
          setBusy(false);
        }
      })();
    },
    [track]
  );

  return { supported, busy, selection, active: selection.kind !== 'none', select };
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
