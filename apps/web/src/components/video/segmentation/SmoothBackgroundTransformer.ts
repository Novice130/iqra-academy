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
 */

import * as vision from '@mediapipe/tasks-vision';
import { VideoTransformer } from '@livekit/track-processors';
import type { VideoTransformerInitOptions } from '@livekit/track-processors';
import { createPipeline, DEFAULT_SETTINGS, type Pipeline, type PipelineSettings } from './glPipeline';

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
  private static readonly MIN_INFERENCE_GAP_MS = 32; // ~30fps ML inference budget

  constructor(options: SmoothBackgroundOptions) {
    super();
    this.options = options;
    this.quality = options.quality ?? DEFAULT_QUALITY;
  }

  private get effectActive() {
    return typeof this.options.blurRadius === 'number' || typeof this.options.imagePath === 'string';
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

    const fileSet = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
    this.segmenter = await vision.ImageSegmenter.createFromOptions(fileSet, {
      baseOptions: { modelAssetPath: MODELS[this.quality], delegate: 'GPU' },
      canvas: this.canvas,
      runningMode: 'VIDEO',
      // Confidence, not category. This is the whole point: a category mask is
      // a per-pixel yes/no and there is no such thing as a soft edge in one.
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    });

    await this.applyMode();
    if (this.options.settings) this.pipeline.setSettings(this.options.settings);
  }

  async restart(opts: VideoTransformerInitOptions) {
    // A new track means a new canvas, and the pipeline holds textures and
    // framebuffers belonging to the old one.
    this.pipeline?.destroy();
    this.pipeline = createPipeline(opts.outputCanvas);
    this.canvas = opts.outputCanvas;
    this.inputVideo = opts.inputElement;
    this.isDisabled = false;
    await this.applyMode();
    if (this.options.settings) this.pipeline?.setSettings(this.options.settings);
  }

  async destroy() {
    this.isDisabled = true;
    await this.segmenter?.close();
    this.segmenter = undefined;
    this.pipeline?.destroy();
    this.pipeline = null;
    this.background?.image.close();
    this.background = null;
    this.canvas = undefined;
  }

  async update(options: SmoothBackgroundOptions) {
    this.options = { ...this.options, ...options };
    if (options.settings) this.pipeline?.setSettings(options.settings);
    await this.applyMode();
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

      if (this.isDisabled || !this.effectActive || !this.pipeline || !this.segmenter) {
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
      const shouldRunInference = now - this.lastInferenceTime >= SmoothBackgroundTransformer.MIN_INFERENCE_GAP_MS || !this.pipeline.ready;

      if (shouldRunInference) {
        this.lastInferenceTime = now;
        const timestamp = Math.max(this.lastTimestamp + 1, now);
        this.lastTimestamp = timestamp;

        this.segmenter.segmentForVideo(frame, timestamp, (result) => {
          const masks = result.confidenceMasks;
          const mask = masks?.[0];
          if (mask) {
            const invert = masks.length > 1;
            this.pipeline!.updateMask(mask.getAsWebGLTexture(), mask.width, mask.height, invert);
          }
          result.close();
        });
      }

      if (this.pipeline.ready && this.pipeline.render(frame)) {
        controller.enqueue(new VideoFrame(canvas, { timestamp: frame.timestamp ?? 0 }));
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
