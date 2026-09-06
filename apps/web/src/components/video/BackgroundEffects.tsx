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

/**
 * Single source of truth for blur strength, shared by the in-call panel, the
 * pre-join picker, and the control-bar quick toggle. These used to disagree
 * (panel 5/15 vs toggle 16), which read as "the toggle does nothing".
 */
export const BLUR_SLIGHT_RADIUS = 6;
export const BLUR_DEFAULT_RADIUS = 18;
export const BLUR_MIN_RADIUS = 6;
export const BLUR_MAX_RADIUS = 30;

export interface BackgroundEffects {
  supported: boolean;
  busy: boolean;
  /** Set when an effect failed or degraded, so the panel can say so. */
  error: string | null;
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

/**
 * Turns a selection into the processor options the track expects.
 *
 * An id that no longer matches a wallpaper resolves to `disabled`, not to an
 * empty path: an empty string still reads as "an effect is active" inside the
 * transformer but fails its own length check, which left the camera passing
 * through raw while the UI insisted a background was on.
 */
export function toProcessorOptions(next: EffectSelection): BackgroundEffectOptions {
  if (next.kind === 'none') return { mode: 'disabled' };
  if (next.kind === 'blur') return { mode: 'background-blur', blurRadius: next.radius };
  const wallpaper = WALLPAPERS.find((w) => w.id === next.id);
  if (!wallpaper) return { mode: 'disabled' };
  return { mode: 'virtual-background', imagePath: wallpaper.path };
}

/**
 * One implementation behind both hooks, because they had drifted into two
 * copies of the same bug.
 *
 * The bug: `select()` used to assign `processorRef.current` *after* awaiting
 * `track.setProcessor()`, while a second effect — which had `selection` in its
 * deps — would see a still-null ref in the same tick and build a processor of
 * its own. `setProcessor` serialises on livekit-client's own lock and stops
 * whatever was attached before, so one of the two was destroyed while the ref
 * pointed at it. Every later `switchTo()` then reached a transformer whose
 * pipeline was null and returned silently: the first background you picked
 * stuck, and nothing after it did anything.
 *
 * Two rules keep it fixed. The ref is assigned *before* any await, and every
 * mutation goes through one promise chain so two swatches tapped quickly cannot
 * interleave.
 */
function useEffectsOnTrack(track: LocalVideoTrack | null, initial?: EffectSelection): BackgroundEffects {
  // Lazy: loadSavedEffect() touches localStorage, so passing it eagerly ran a
  // getItem + JSON.parse on every render of the conference.
  const [selection, setSelection] = useState<EffectSelection>(
    () => initial ?? loadSavedEffect() ?? { kind: 'none' }
  );
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processorRef = useRef<BackgroundProcessor | null>(null);
  const selectionRef = useRef(selection);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRef = useRef(0);

  useEffect(() => {
    setSupported(supportsBackgroundEffects());
  }, []);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  const onError = useCallback((message: string) => setError(message), []);

  /** Serialises processor work and reports failures instead of swallowing them. */
  const run = useCallback((job: () => Promise<void>) => {
    pendingRef.current += 1;
    setBusy(true);
    queueRef.current = queueRef.current
      .then(job)
      .catch((err) => {
        // These used to be `.catch(() => {})`, which is why a CSP that blocked
        // MediaPipe outright looked like nothing happening at all.
        console.error('Background effect failed', err);
        setError('That effect could not be applied.');
      })
      .finally(() => {
        pendingRef.current -= 1;
        if (pendingRef.current === 0) setBusy(false);
      });
  }, []);

  /** Attach or re-point the processor. Never constructs a second one. */
  const apply = useCallback(
    async (target: LocalVideoTrack, options: BackgroundEffectOptions) => {
      if (options.mode === 'disabled') {
        if (processorRef.current) await target.stopProcessor();
        processorRef.current = null;
        return;
      }
      const existing = processorRef.current;
      if (existing) {
        // A republished track carries no processor even though the person still
        // expects their background: re-attach the one we have rather than
        // paying for a new segmenter.
        if (target.getProcessor() !== existing) await target.setProcessor(existing);
        await existing.switchTo(options);
        return;
      }
      const processor = new BackgroundProcessor({ ...options, onError });
      processorRef.current = processor;
      await target.setProcessor(processor);
    },
    [onError]
  );

  // Keeps the effect attached to whatever camera track is currently live.
  // Two cases: the effect was chosen on the pre-join screen and there was no
  // room track yet, and the track being republished (camera toggled off and
  // on, or a device switch). It reads the selection through a ref on purpose —
  // with `selection` in its deps it fired on every pick and raced `select()`.
  useEffect(() => {
    if (!track) {
      // The preview track is recreated wholesale; its processor went with it.
      processorRef.current = null;
      return;
    }
    const options = toProcessorOptions(selectionRef.current);
    if (options.mode === 'disabled') return;
    run(() => apply(track, options));
  }, [track, run, apply]);

  const select = useCallback(
    (next: EffectSelection) => {
      // Remember the choice even with the camera off, so turning the camera
      // back on restores it via the effect above — and remember it for the
      // next class too.
      setSelection(next);
      selectionRef.current = next;
      saveEffect(next);
      setError(null);
      if (!track) return;
      run(() => apply(track, toProcessorOptions(next)));
    },
    [track, run, apply]
  );

  return {
    supported,
    busy,
    error,
    selection,
    active: toProcessorOptions(selection).mode !== 'disabled',
    select,
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
  const track = (cameraTrack?.track ??
    localParticipant.getTrackPublication(Track.Source.Camera)?.track) as LocalVideoTrack | undefined;
  return useEffectsOnTrack(track ?? null, initial);
}

/**
 * Same contract as useBackgroundEffects, but for a track that isn't in a
 * room yet — the pre-join preview. Lets someone pick their background before
 * anyone sees them, which is the whole point of a pre-join screen.
 */
export function usePreviewBackgroundEffects(track: LocalVideoTrack | null): BackgroundEffects {
  return useEffectsOnTrack(track);
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
      className="relative aspect-video w-full rounded-xl overflow-hidden cursor-pointer bg-cover bg-center flex items-center justify-center transition-all duration-150 active:scale-95 shadow-md"
      style={{
        outline: active ? '2.5px solid #34c98a' : '1px solid rgba(255,255,255,0.15)',
        outlineOffset: '-1px',
        boxShadow: active ? '0 0 12px rgba(52, 201, 138, 0.4)' : 'none',
        ...style,
      }}
    >
      {children}
      <span
        className="absolute inset-x-0 bottom-0 px-1.5 py-0.5 text-[9px] font-semibold truncate backdrop-blur-md"
        style={{ background: 'rgba(0,0,0,0.65)', color: '#fff' }}
      >
        {label}
      </span>
    </button>
  );
}

export function BackgroundEffectsContent({
  effects,
  onSelect,
  onClose,
}: {
  effects: BackgroundEffects;
  onSelect?: () => void;
  onClose?: () => void;
}) {
  const { selection, select, supported, busy, error } = effects;

  const handlePick = (choice: EffectSelection) => {
    select(choice);
    onSelect?.();
  };

  if (!supported) {
    return (
      <div className="px-4 py-4 text-sm text-white/60">
        This browser can&apos;t run background effects.
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="flex items-center justify-between px-1 py-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-white/50">
          Visual Effects {busy && <span className="normal-case font-normal text-blue-400">· applying…</span>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        )}
      </div>
      {error && (
        <div
          className="mb-2 rounded-lg px-2.5 py-1.5 text-[11px]"
          style={{ background: 'rgba(234,67,53,0.14)', color: '#f6a6a0' }}
        >
          {error}
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        <Swatch
          label="None"
          active={selection.kind === 'none'}
          onClick={() => handlePick({ kind: 'none' })}
          style={{ background: '#2a2d33' }}
        />
        <Swatch
          label="Slight blur"
          active={selection.kind === 'blur' && selection.radius <= 6}
          onClick={() => handlePick({ kind: 'blur', radius: BLUR_SLIGHT_RADIUS })}
          style={{ background: 'linear-gradient(135deg,#3d4149,#5a606b)' }}
        />
        <Swatch
          label="Blur"
          active={selection.kind === 'blur' && selection.radius > 6}
          onClick={() => handlePick({ kind: 'blur', radius: BLUR_DEFAULT_RADIUS })}
          style={{ background: 'linear-gradient(135deg,#4a4f59,#7c838f)' }}
        />
        {WALLPAPERS.map((w) => (
          <Swatch
            key={w.id}
            label={w.label}
            active={selection.kind === 'image' && selection.id === w.id}
            onClick={() => handlePick({ kind: 'image', id: w.id })}
            style={{ backgroundImage: `url(${w.path})` }}
          />
        ))}
      </div>
      {selection.kind === 'blur' && (
        <div className="mt-3 px-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-white/60">Blur strength</span>
            <span className="text-[11px] font-mono text-white/60">{selection.radius}</span>
          </div>
          <input
            type="range"
            min={BLUR_MIN_RADIUS}
            max={BLUR_MAX_RADIUS}
            step={1}
            value={selection.radius}
            onChange={(e) => handlePick({ kind: 'blur', radius: Number(e.target.value) })}
            className="w-full accent-[#0A84FF] h-1 bg-white/20 rounded-lg cursor-pointer"
            aria-label="Blur strength"
          />
        </div>
      )}
    </div>
  );
}
