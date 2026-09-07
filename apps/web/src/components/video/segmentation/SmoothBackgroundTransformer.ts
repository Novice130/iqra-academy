/**
 * Our background transformer: MediaPipe segmentation into the pipeline in
 * `glPipeline.ts`, wired into LiveKit as an ordinary track processor.
 *
 * Why not `@livekit/track-processors`' own BackgroundProcessor: see the header
 * of glPipeline.ts. Short version — it thresholds a binary 256x144 mask with
 * no memory of the previous frame, and both of those are visible on a face.
 *
 * Two models are wired up and the cheap one is the default — see
 * DEFAULT_QUALITY for why the other one lost. Both are asked for *confidence*
 * masks rather than category masks; what channel 0 then means differs between
 * them, which `transform` sorts out.
 *
 * Inference runs in a Web Worker (`segmentation.worker.ts`) wherever Workers
 * exist, because segmenting a 720p frame on the main thread every ~66ms is what
 * used to stall compositing and read as "noise". The main-thread segmenter is
 * strictly a fallback for environments where the worker cannot start. Both
 * paths infer on a dedicated 256x144 downscale canvas — never on the shared
 * output canvas, and never via a shared WebGL texture: the mask crosses into
 * the pipeline as a plain Uint8Array, so neither MediaPipe's GL state nor ours
 * can clobber the other.
 */

import * as vision from '@mediapipe/tasks-vision';
import { VideoTransformer } from '@livekit/track-processors';
import type { VideoTransformerInitOptions } from '@livekit/track-processors';
import { createPipeline, DEFAULT_SETTINGS, type Pipeline, type PipelineSettings } from './glPipeline';
import { SegmentationWorkerClient, type WorkerMask } from './SegmentationWorkerClient';

/**
 * Both the WASM and the model are served from our own origin.
 *
 * They used to be fetched from cdn.jsdelivr.net and storage.googleapis.com,
 * and that is what broke background effects: the CSP added on 2026-08-20
 * (`src/middleware.ts`) allows scripts from `'self'` only, and MediaPipe loads
 * its WASM glue by injecting a `<script>` tag. Nothing surfaced, because every
 * caller swallowed the rejection.
 *
 * `scripts/copy-mediapipe.mjs` stages the WASM out of node_modules at build
 * time, so it is always the `@mediapipe/tasks-vision` version pinned in
 * package.json — which is the version `@livekit/track-processors` expects.
 */
const WASM_BASE = '/mediapipe/wasm';

const MODELS = {
  /** 256x144, two classes. The cheap one; what the old pipeline always used. */
  fast: '/mediapipe/models/selfie_segmenter.tflite',
  /**
   * 256x256, six classes. Cleaner hair and shoulders, ~3x the cost.
   *
   * 16MB, and only `/debug/segmentation?model=detailed` ever asks for it, so it
   * is not committed and not shipped: run the copy script with
   * `MEDIAPIPE_DETAILED=1` to have it locally. In production this 404s, which
   * is the correct outcome for a bench-only asset.
   */
  detailed: '/mediapipe/models/selfie_multiclass_256x256.tflite',
} as const;

export type ModelQuality = keyof typeof MODELS;

/**
 * The cheap model, everywhere — including on machines that could afford the
 * other one.
 *
 * This was going to be a per-device choice, and the bench (`/debug/segmentation`)
 * is what talked me out of it. On the same frame the two are indistinguishable
 * at the edges, because what was wrong with the old pipeline was never the
 * model: it was thresholding a binary mask with no memory between frames. What
 * the detailed model *does* change is that its sixth category, "others", takes
 * in accessories and whatever is on the desk — so a teacher at a laptop keeps a
 * slab of laptop lid floating in front of the wallpaper, which the two-class
 * model does not. Three times the cost per frame for a worse failure.
 *
 * `detailed` stays reachable for the case this was bought for — fine hair,
 * which a hijab in a test photo cannot show — via `?model=detailed` on the
 * bench. Move the default here if it ever earns it in front of a real camera.
 */
export const DEFAULT_QUALITY: ModelQuality = 'fast';

/**
 * What a wallpaper degrades to when it cannot be loaded. Deliberately not
 * "nothing": someone who picked a background wanted their room hidden, and the
 * failure mode of showing it anyway is the one that matters.
 */
const FALLBACK_BLUR_RADIUS = 12;

export interface SmoothBackgroundOptions extends Record<string, unknown> {
  /** Blur strength in output pixels. Ignored when `imagePath` is set. */
  blurRadius?: number;
  /** A wallpaper to sit behind the person. Wins over `blurRadius`. */
  imagePath?: string;
  /** Neither set means pass the camera through untouched. */
  quality?: ModelQuality;
  settings?: Partial<PipelineSettings>;
  /** Told when an effect degrades, so the UI can say so instead of lying. */
  onError?: (message: string) => void;
}

export default class SmoothBackgroundTransformer extends VideoTransformer<SmoothBackgroundOptions> {
  static get isSupported() {
    if (typeof document === 'undefined') return false;
    return (
      typeof OffscreenCanvas !== 'undefined' &&
      typeof VideoFrame !== 'undefined' &&
      typeof createImageBitmap !== 'undefined' &&
      !!document.createElement('canvas').getContext('webgl2')
    );
  }

  options: SmoothBackgroundOptions;

  private segmenter?: vision.ImageSegmenter;

  private pipeline: Pipeline | null = null;

  private background: { path: string; image: ImageBitmap } | null = null;

  private quality: ModelQuality;

  /** Segmentation wants a monotonically increasing timestamp in milliseconds. */
  private lastTimestamp = 0;

  /** Minimum gap between heavy ML segmentation passes (ms) to keep 60fps WebGL fluid */
  private lastInferenceTime = 0;
  private inferenceGapMs = 66; // adaptive gap (~15fps ML inference budget)
  private isInferring = false;
  private inferenceCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private inferenceCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  /** MediaPipe's own canvas, kept free of any 2d context — see the glCanvas getter. */
  private segmenterCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  private worker: SegmentationWorkerClient | null = null;
  private generation = 0;
  private inferenceSequence = 0;
  private acceptedSequence = 0;
  private lastMaskTime = 0;
  private workerFailureReported = false;
  /**
   * Read-only numbers for the `/debug/segmentation` bench overlay. Updated on
   * the hot path (a few assignments per accepted mask) so they stay cheap.
   */
  readonly diagnostics = {
    /** 'worker' when the off-thread path is live, 'main' for the fallback, 'none' before init. */
    path: 'none' as 'none' | 'worker' | 'main',
    /** GPU vs CPU, as reported by whichever inference path is live. */
    delegate: null as 'GPU' | 'CPU' | null,
    /** Wall-clock ms of the last accepted mask (worker round-trip or main-thread call). */
    lastInferenceMs: 0,
    /** Current throttle gap between inference passes. */
    inferenceGapMs: 66,
    /** Width/height of the last accepted mask. */
    lastMaskSize: null as { width: number; height: number } | null,
    /** When the last mask landed (performance.now). The bench derives freshness from this. */
    lastMaskTime: 0,
    /** Monotonic count of accepted masks — the bench derives mask-fps from its slope. */
    masksAccepted: 0,
  };

  constructor(options: SmoothBackgroundOptions) {
    super();
    this.options = options;
    this.quality = options.quality ?? DEFAULT_QUALITY;
  }

  private get effectActive() {
    return typeof this.options.blurRadius === 'number' || typeof this.options.imagePath === 'string';
  }

  private setupInferenceCanvas() {
    const size = this.quality === 'detailed' ? 256 : 144;
    if (typeof OffscreenCanvas !== 'undefined') {
      this.inferenceCanvas = new OffscreenCanvas(256, size);
    } else if (typeof document !== 'undefined') {
      this.inferenceCanvas = document.createElement('canvas');
      this.inferenceCanvas.width = 256;
      this.inferenceCanvas.height = size;
    }
    this.inferenceCtx = this.inferenceCanvas
      ? (this.inferenceCanvas.getContext('2d', { alpha: false }) as typeof this.inferenceCtx)
      : null;
  }

  /**
   * A context-free canvas for MediaPipe. It never gets a 2d context: a canvas
   * that already has one cannot also give the graph runner the WebGL context
   * it needs, and sharing the draw canvas made every delegate fail at
   * `StartGraph` with a missing `kGpuService`.
   */
  private get glCanvas(): OffscreenCanvas | HTMLCanvasElement | null {
    if (this.segmenterCanvas) return this.segmenterCanvas;
    const size = this.quality === 'detailed' ? 256 : 144;
    if (typeof OffscreenCanvas !== 'undefined') {
      this.segmenterCanvas = new OffscreenCanvas(256, size);
    } else if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = size;
      this.segmenterCanvas = c;
    }
    return this.segmenterCanvas;
  }

  private async initializeInference() {
    if (typeof Worker !== 'undefined' && typeof VideoFrame !== 'undefined') {
      try {
        const worker = new SegmentationWorkerClient(
          this.quality,
          (mask) => this.acceptWorkerMask(mask),
          (message) => this.fallbackFromWorker(message)
        );
        await worker.init();
        this.worker = worker;
        this.diagnostics.path = 'worker';
        this.diagnostics.delegate = worker.delegate;
        return;
      } catch (error) {
        console.warn('Background worker unavailable, using reduced main-thread inference', error);
      }
    }

    await this.initializeMainThreadSegmenter();
  }

  private async initializeMainThreadSegmenter() {
    if (this.segmenter) return;
    const canvas = this.glCanvas;
    if (!canvas) throw new Error('Background inference canvas is unavailable');
    const fileSet = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    try {
      this.segmenter = await vision.ImageSegmenter.createFromOptions(fileSet, {
        baseOptions: { modelAssetPath: MODELS[this.quality], delegate: 'GPU' },
        canvas,
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.diagnostics.path = 'main';
      this.diagnostics.delegate = 'GPU';
    } catch (gpuErr) {
      console.warn('GPU segmentation unavailable, falling back to CPU delegate', gpuErr);
      this.segmenter = await vision.ImageSegmenter.createFromOptions(fileSet, {
        baseOptions: { modelAssetPath: MODELS[this.quality], delegate: 'CPU' },
        canvas,
        runningMode: 'VIDEO',
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      this.diagnostics.path = 'main';
      this.diagnostics.delegate = 'CPU';
    }
  }

  private fallbackFromWorker(message: string) {
    if (!this.worker) return;
    this.worker.close();
    this.worker = null;
    this.isInferring = false;
    if (!this.workerFailureReported) {
      this.workerFailureReported = true;
      console.warn('Background worker failed, using reduced main-thread inference:', message);
    }
    void this.initializeMainThreadSegmenter().catch((error) => {
      console.error('Background fallback inference failed', error);
      this.options.onError?.('Background segmentation slowed down — keeping your room hidden.');
    });
  }

  private acceptWorkerMask(mask: WorkerMask) {
    this.isInferring = false;
    if (mask.generation !== this.generation || mask.sequence <= this.acceptedSequence || !this.pipeline) return;
    this.acceptedSequence = mask.sequence;
    this.lastMaskTime = performance.now();
    this.adaptInferenceGap(mask.durationMs);
    this.pipeline.updateMask(mask.data, mask.width, mask.height, mask.invert);
    this.diagnostics.lastInferenceMs = mask.durationMs;
    this.diagnostics.lastMaskSize = { width: mask.width, height: mask.height };
    this.diagnostics.lastMaskTime = this.lastMaskTime;
    this.diagnostics.masksAccepted += 1;
  }

  private adaptInferenceGap(durationMs: number) {
    if (durationMs > 22) {
      this.inferenceGapMs = Math.min(120, this.inferenceGapMs + 6);
    } else if (durationMs < 12 && this.inferenceGapMs > 66) {
      this.inferenceGapMs = Math.max(66, this.inferenceGapMs - 3);
    }
    this.diagnostics.inferenceGapMs = this.inferenceGapMs;
  }

  async init({ outputCanvas, inputElement: inputVideo }: VideoTransformerInitOptions) {
    if (!(inputVideo instanceof HTMLVideoElement)) {
      throw TypeError('Background effects need a video element as input');
    }

    // Deliberately not `super.init`: the base class would build the upstream
    // WebGL pipeline on this canvas, and two pipelines cannot share one
    // context. Everything it sets up is set up here instead.
    this.transformer = new TransformStream({
      transform: (frame, controller) => this.transform(frame, controller),
    });
    this.canvas = outputCanvas;
    this.inputVideo = inputVideo;
    this.isDisabled = false;

    this.pipeline = createPipeline(outputCanvas);
    if (!this.pipeline) throw new Error('WebGL2 is unavailable');

    this.setupInferenceCanvas();
    await this.initializeInference();

    await this.applyMode();
    if (this.options.settings) this.pipeline.setSettings(this.options.settings);
  }

  async restart(opts: VideoTransformerInitOptions) {
    this.generation += 1;
    this.acceptedSequence = 0;
    this.lastMaskTime = 0;
    this.isInferring = false;
    this.diagnostics.lastMaskTime = 0;
    this.diagnostics.lastMaskSize = null;
    this.diagnostics.masksAccepted = 0;
    this.pipeline?.destroy();
    this.pipeline = createPipeline(opts.outputCanvas);
    this.canvas = opts.outputCanvas;
    this.inputVideo = opts.inputElement;
    this.isDisabled = false;
    // The worker survives a restart: the generation bump above invalidates its
    // in-flight masks, and the next ones land on the fresh pipeline. The
    // main-thread segmenter holds no per-canvas state worth rebuilding either.
    await this.applyMode();
    if (this.options.settings) this.pipeline?.setSettings(this.options.settings);
  }

  async destroy() {
    this.isDisabled = true;
    this.isInferring = false;
    this.generation += 1;
    this.worker?.close();
    this.worker = null;
    if (this.segmenter) {
      try { this.segmenter.close(); } catch {}
      this.segmenter = undefined;
    }
    this.pipeline?.destroy();
    this.pipeline = null;
    this.background?.image.close();
    this.background = null;
    this.canvas = undefined;
    this.inferenceCanvas = null;
    this.inferenceCtx = null;
    this.segmenterCanvas = null;
  }

  async update(options: SmoothBackgroundOptions) {
    const prevQuality = this.quality;
    this.options = { ...this.options, ...options };
    if (options.quality && options.quality !== prevQuality) {
      this.quality = options.quality;
      await this.reinitializeInference();
    }
    if (options.settings) this.pipeline?.setSettings(options.settings);
    await this.applyMode();
  }

  /**
   * Tears down whichever inference path is live and builds it again for the
   * current quality. Only the bench switches quality mid-stream, but without
   * this the switch silently kept segmenting with the old model.
   */
  private async reinitializeInference() {
    this.generation += 1;
    this.acceptedSequence = 0;
    this.lastMaskTime = 0;
    this.isInferring = false;
    this.diagnostics.path = 'none';
    this.diagnostics.delegate = null;
    this.diagnostics.lastMaskTime = 0;
    this.diagnostics.lastMaskSize = null;
    this.diagnostics.masksAccepted = 0;
    this.worker?.close();
    this.worker = null;
    if (this.segmenter) {
      try { this.segmenter.close(); } catch {}
      this.segmenter = undefined;
    }
    this.workerFailureReported = false;
    this.setupInferenceCanvas();
    await this.initializeInference();
  }

  /** Pushes the current blur/wallpaper choice down into the pipeline. */
  private async applyMode() {
    if (!this.pipeline) return;
    const { imagePath, blurRadius } = this.options;

    if (typeof imagePath === 'string' && imagePath.length > 0) {
      try {
        if (this.background?.path !== imagePath) {
          const image = await loadImage(imagePath);
          this.background?.image.close();
          this.background = { path: imagePath, image };
        }
        this.pipeline.setMode({ kind: 'image', image: this.background.image });
        return;
      } catch (err) {
        // Not `setMode(null)`. With an effect still nominally active that makes
        // `render()` bail (see glPipeline.ts) and every frame passes through
        // raw — so a wallpaper that failed to load would quietly broadcast the
        // room it was chosen to hide. Blur instead, and say so.
        console.error('Failed to load virtual background image:', err);
        this.options.blurRadius = FALLBACK_BLUR_RADIUS;
        this.pipeline.setMode({ kind: 'blur', radius: FALLBACK_BLUR_RADIUS });
        this.options.onError?.('That background could not be loaded — blurred your camera instead.');
        return;
      }
    }

    if (typeof blurRadius === 'number') {
      this.pipeline.setMode({ kind: 'blur', radius: blurRadius });
      return;
    }

    this.pipeline.setMode(null);
  }

  private requestInference(frame: VideoFrame, now: number) {
    const timestamp = Math.max(this.lastTimestamp + 1, now);
    const sequence = ++this.inferenceSequence;
    this.lastTimestamp = timestamp;

    if (this.worker) {
      const accepted = this.worker.segment(
        new VideoFrame(frame),
        this.generation,
        sequence,
        timestamp
      );
      if (accepted) {
        this.lastInferenceTime = now;
        this.isInferring = true;
      }
      return;
    }

    if (!this.segmenter || !this.inferenceCanvas || !this.inferenceCtx || this.isInferring) return;
    this.lastInferenceTime = now;
    this.isInferring = true;
    this.inferenceCtx.drawImage(
      frame,
      0,
      0,
      this.inferenceCanvas.width,
      this.inferenceCanvas.height
    );
    const generation = this.generation;
    const startedAt = performance.now();

    try {
      this.segmenter.segmentForVideo(this.inferenceCanvas, timestamp, (result) => {
        try {
          if (generation !== this.generation || !this.pipeline) return;
          const masks = result.confidenceMasks;
          const mask = masks?.[0];
          if (!mask || sequence <= this.acceptedSequence) return;
          const data = new Uint8Array(mask.getAsUint8Array());
          this.acceptedSequence = sequence;
          this.lastMaskTime = performance.now();
          const durationMs = performance.now() - startedAt;
          this.adaptInferenceGap(durationMs);
          this.pipeline.updateMask(data, mask.width, mask.height, masks.length > 1);
          this.diagnostics.lastInferenceMs = durationMs;
          this.diagnostics.lastMaskSize = { width: mask.width, height: mask.height };
          this.diagnostics.lastMaskTime = this.lastMaskTime;
          this.diagnostics.masksAccepted += 1;
        } finally {
          result.close();
          this.isInferring = false;
        }
      });
    } catch (error) {
      this.isInferring = false;
      console.error('Reduced background inference failed', error);
    }
  }

  transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
    // Two separate questions, and conflating them leaks frames: `handled` is
    // whether anything at all was enqueued, `passedThrough` is whether the
    // *incoming* frame was the thing enqueued — in which case the stream owns
    // it now and closing it here would pull it out from under the encoder.
    let handled = false;
    let passedThrough = false;
    const passThrough = () => {
      controller.enqueue(frame);
      handled = true;
      passedThrough = true;
    };

    try {
      if (!(frame instanceof VideoFrame) || frame.codedWidth === 0 || frame.codedHeight === 0) {
        return;
      }

      // Resolution floor: below 320p wide, WebRTC is already degrading hard and
      // segmentation costs more than it hides. Pass through to break the spiral.
      if (frame.displayWidth < 320) {
        passThrough();
        return;
      }

      if (this.isDisabled || !this.effectActive || !this.pipeline) {
        passThrough();
        return;
      }

      const canvas = this.canvas;
      if (!canvas) throw new TypeError('Canvas needs to be initialized first');
      if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
        canvas.width = frame.displayWidth;
        canvas.height = frame.displayHeight;
      }

      const now = performance.now();
      if (now - this.lastInferenceTime >= this.inferenceGapMs && !this.isInferring) {
        this.requestInference(frame, now);
      }

      // Fail closed: until a fresh mask exists (first frame, worker starting,
      // camera just covered) draw the blurred scene rather than the raw room.
      // `render` with privacyFallback draws the blur fullscreen and still
      // returns true, so the encoder keeps getting composited frames.
      const maskIsFresh = this.pipeline.ready && now - this.lastMaskTime <= 750;
      if (this.pipeline.render(frame, !maskIsFresh)) {
        controller.enqueue(
          new VideoFrame(canvas, {
            timestamp: frame.timestamp ?? 0,
            duration: frame.duration ?? undefined,
          })
        );
        handled = true;
      } else {
        passThrough();
      }
    } catch (err) {
      console.error('Background effect frame failed', err);
      if (!handled) passThrough();
    } finally {
      if (!passedThrough) frame.close();
    }
  }
}

async function loadImage(path: string): Promise<ImageBitmap> {
  if (path.endsWith('.svg') || path.includes('.svg')) {
    // For SVGs, fetch the text to create a data/blob URL to ensure all vector definitions/filters are loaded
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to fetch SVG at ${path}: ${res.statusText}`);
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(new Error(`Failed to load SVG background at ${path}: ${e}`));
        img.src = url;
      });

      const width = 1280;
      const height = 720;
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(width, height);
      } else {
        canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error('Cannot get 2d context for SVG rasterization');
      ctx.drawImage(img, 0, 0, width, height);
      return await createImageBitmap(canvas);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch image at ${path}: ${res.statusText}`);
  const blob = await res.blob();
  return await createImageBitmap(blob);
}

export { DEFAULT_SETTINGS };
export type { PipelineSettings };
