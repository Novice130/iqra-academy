'use client';

/**
 * A bench for the background pipeline: your camera, raw on the left and
 * processed on the right, with every tuning knob exposed.
 *
 * This exists because segmentation quality cannot be judged any other way. A
 * green build says nothing about it, a headless browser has no face to
 * segment, and the fake camera Chrome offers is a flat colour — the easiest
 * possible subject and therefore the least informative one. The numbers in
 * `DEFAULT_SETTINGS` were chosen here, in front of a real camera, and anyone
 * changing them should come back here rather than guess.
 *
 * No auth and no database: it is a camera and a canvas.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalVideoTrack } from 'livekit-client';
import {
  BackgroundProcessor,
  supportsBackgroundEffects,
  DEFAULT_QUALITY,
  type BackgroundEffectOptions,
  type ModelQuality,
  type PipelineSettings,
} from '@/components/video/segmentation';
import { DEFAULT_SETTINGS } from '@/components/video/segmentation/SmoothBackgroundTransformer';
import { WALLPAPERS, BLUR_DEFAULT_RADIUS, BLUR_SLIGHT_RADIUS } from '@/components/video/BackgroundEffects';

const EFFECTS: { label: string; value: BackgroundEffectOptions }[] = [
  { label: 'None', value: { mode: 'disabled' } },
  { label: 'Slight blur', value: { mode: 'background-blur', blurRadius: BLUR_SLIGHT_RADIUS } },
  { label: 'Blur', value: { mode: 'background-blur', blurRadius: BLUR_DEFAULT_RADIUS } },
  ...WALLPAPERS.map((w) => ({
    label: w.label,
    value: { mode: 'virtual-background', imagePath: w.path } as BackgroundEffectOptions,
  })),
];

const SLIDERS: {
  key: keyof PipelineSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}[] = [
  {
    key: 'temporalBlend',
    label: 'Temporal blend',
    min: 0.05,
    max: 1,
    step: 0.05,
    hint: 'How much of each new mask is taken. 1 = no smoothing, and the edges crawl.',
  },
  {
    key: 'maskFeather',
    label: 'Mask feather',
    min: 0,
    max: 4,
    step: 0.1,
    hint: 'Blur applied to the mask, in mask texels. Too much and hair turns to fog.',
  },
  {
    key: 'edgeSoftness',
    label: 'Edge softness',
    min: 0.01,
    max: 0.4,
    step: 0.01,
    hint: 'Width of the alpha ramp. Small is crisp; too small brings back the stair-steps.',
  },
  {
    key: 'lightWrap',
    label: 'Light wrap',
    min: 0,
    max: 1,
    step: 0.05,
    hint: 'Background colour bleeding onto the rim. Stops the cut-out look; overdo it and you get a halo.',
  },
];

export default function SegmentationBenchPage() {
  const rawRef = useRef<HTMLVideoElement>(null);
  const processedRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const processorRef = useRef<BackgroundProcessor | null>(null);

  const [status, setStatus] = useState('Starting camera…');
  const [effect, setEffect] = useState(0);
  const [settings, setSettings] = useState<PipelineSettings>(DEFAULT_SETTINGS);
  const [quality, setQuality] = useState<ModelQuality>('fast');
  const [fps, setFps] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // `?model=detailed` swaps in the multiclass model, which is the whole reason
  // this override exists: it is the comparison the default was chosen from.
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get('model');
    setQuality(forced === 'fast' || forced === 'detailed' ? forced : DEFAULT_QUALITY);
  }, []);

  useEffect(() => {
    if (!supportsBackgroundEffects()) {
      setStatus('This browser cannot run background effects.');
      return;
    }

    let cancelled = false;
    let track: LocalVideoTrack | null = null;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        track = new LocalVideoTrack(stream.getVideoTracks()[0]);
        trackRef.current = track;
        if (rawRef.current) rawRef.current.srcObject = new MediaStream([stream.getVideoTracks()[0]]);
        setStatus('Camera running. Pick an effect.');
      } catch (err) {
        setStatus(`Camera failed: ${(err as Error).message}`);
      }
    })();

    return () => {
      cancelled = true;
      processorRef.current = null;
      track?.stop();
      trackRef.current = null;
    };
  }, []);

  /** Counts frames actually delivered by the processed track. */
  useEffect(() => {
    const video = processedRef.current;
    if (!video || !('requestVideoFrameCallback' in video)) return;
    let frames = 0;
    let last = performance.now();
    let handle = 0;
    const tick = () => {
      frames += 1;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => video.cancelVideoFrameCallback(handle);
  }, []);

  /**
   * Read-only diagnostics from the live transformer: which inference path is
   * running and on which delegate, how long the last mask took, its size, how
   * fresh it is, and how fast masks are landing. Polled at 2Hz — cheap enough
   * to leave on, slow enough not to fight the compositor.
   */
  const [diagnostics, setDiagnostics] = useState<{
    path: string;
    delegate: string;
    inferenceMs: string;
    gapMs: number;
    maskSize: string;
    maskAgeMs: string;
    maskFps: string;
    ready: string;
  } | null>(null);

  useEffect(() => {
    if (effect === 0) {
      setDiagnostics(null);
      return;
    }
    let lastCount = 0;
    let lastAt = performance.now();
    const timer = setInterval(() => {
      const d = processorRef.current?.transformerDiagnostics;
      if (!d) return;
      const now = performance.now();
      const maskFps = ((d.masksAccepted - lastCount) * 1000) / Math.max(1, now - lastAt);
      lastCount = d.masksAccepted;
      lastAt = now;
      setDiagnostics({
        path: d.path,
        delegate: d.delegate ?? '—',
        inferenceMs: d.masksAccepted > 0 ? `${d.lastInferenceMs.toFixed(1)} ms` : '—',
        gapMs: d.inferenceGapMs,
        maskSize: d.lastMaskSize ? `${d.lastMaskSize.width}×${d.lastMaskSize.height}` : '—',
        maskAgeMs: d.lastMaskTime > 0 ? `${Math.max(0, Math.round(now - d.lastMaskTime))} ms` : '—',
        maskFps: d.masksAccepted > 0 ? `${maskFps.toFixed(1)}/s` : '—',
        ready: d.lastMaskTime > 0 && now - d.lastMaskTime <= 750 ? 'fresh' : 'stale',
      });
    }, 500);
    return () => clearInterval(timer);
  }, [effect, quality]);

  const applyEffect = useCallback(
    async (index: number, nextSettings: PipelineSettings) => {
      const track = trackRef.current;
      if (!track) return;
      const target = EFFECTS[index].value;

      try {
        if (target.mode === 'disabled') {
          if (processorRef.current) await track.stopProcessor();
          processorRef.current = null;
        } else if (processorRef.current) {
          await processorRef.current.switchTo(target);
          await processorRef.current.updateTransformerOptions({ settings: nextSettings });
        } else {
          const processor = new BackgroundProcessor({
            ...target,
            settings: nextSettings,
            quality,
            // Why here and not in the transformer's own logs: MediaPipe and
            // WebGL failures otherwise surface nowhere — the bench is where a
            // real camera meets the real pipeline, so this is where they land.
            onError: (message) => setLastError(message),
          });
          await track.setProcessor(processor);
          processorRef.current = processor;
        }
        // The processed track is a different MediaStreamTrack from the source.
        const output = track.mediaStreamTrack;
        if (processedRef.current) {
          processedRef.current.srcObject = new MediaStream([output]);
        }
        setStatus(`Model: ${quality}. Effect: ${EFFECTS[index].label}.`);
      } catch (err) {
        setStatus(`Failed: ${(err as Error).message}`);
      }
    },
    [quality]
  );

  useEffect(() => {
    applyEffect(effect, settings);
    // Settings changes go through their own handler so a slider drag doesn't
    // rebuild the processor on every pixel of travel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect]);

  const updateSetting = (key: keyof PipelineSettings, value: number) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    processorRef.current?.updateTransformerOptions({ settings: next }).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#111] text-white p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Background segmentation bench</h1>
        <p className="text-sm text-white/60">{status}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <figure className="space-y-2">
          <video
            ref={rawRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg bg-black"
            style={{ transform: 'scaleX(-1)' }}
          />
          <figcaption className="text-xs text-white/50">Camera, untouched</figcaption>
        </figure>
        <figure className="space-y-2">
          <video
            ref={processedRef}
            autoPlay
            playsInline
            muted
            className="w-full rounded-lg bg-black"
            style={{ transform: 'scaleX(-1)' }}
          />
          <figcaption className="text-xs text-white/50">Processed · {fps} fps</figcaption>
        </figure>
      </div>

      {diagnostics && (
        <section aria-label="Pipeline diagnostics" className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <h2 className="text-sm font-semibold text-white/90">Diagnostics</h2>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
            <div className="flex justify-between gap-2"><dt className="text-white/45">Inference path</dt><dd className="font-mono text-white/90">{diagnostics.path}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Delegate</dt><dd className="font-mono text-white/90">{diagnostics.delegate}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Last inference</dt><dd className="font-mono text-white/90">{diagnostics.inferenceMs}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Inference gap</dt><dd className="font-mono text-white/90">{diagnostics.gapMs} ms</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Mask size</dt><dd className="font-mono text-white/90">{diagnostics.maskSize}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Mask age</dt><dd className="font-mono text-white/90">{diagnostics.maskAgeMs}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Mask rate</dt><dd className="font-mono text-white/90">{diagnostics.maskFps}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-white/45">Mask state</dt><dd className="font-mono text-white/90">{diagnostics.ready}</dd></div>
          </dl>
          {lastError && (
            <p role="alert" className="mt-2 text-xs text-red-300">Last error: {lastError}</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {EFFECTS.map((e, i) => (
            <button
              key={e.label}
              type="button"
              onClick={() => setEffect(i)}
              className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
              style={{
                background: i === effect ? 'rgba(138,180,248,0.25)' : 'rgba(255,255,255,0.08)',
                color: i === effect ? '#8ab4f8' : '#e8eaed',
              }}
            >
              {e.label}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {SLIDERS.map((slider) => (
            <label key={slider.key} className="block space-y-1">
              <span className="flex justify-between text-sm">
                <span>{slider.label}</span>
                <span className="text-white/50">{settings[slider.key].toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                value={settings[slider.key]}
                onChange={(e) => updateSetting(slider.key, Number(e.target.value))}
                className="w-full"
              />
              <span className="block text-[11px] text-white/45">{slider.hint}</span>
            </label>
          ))}
        </div>

        <p className="text-[11px] text-white/45">
          Model: <strong>{quality}</strong> — add <code>?model=detailed</code> to compare against
          the multiclass one. Settings here are not saved; when you find better numbers, put them
          in <code>DEFAULT_SETTINGS</code>.
        </p>
      </section>
    </div>
  );
}
