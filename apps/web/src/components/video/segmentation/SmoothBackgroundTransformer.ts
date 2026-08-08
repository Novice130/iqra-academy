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

/** Pinned to the version `@livekit/track-processors` depends on. */
const TASKS_VISION_VERSION = '0.10.14';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;

const MODELS = {
  /** 256x144, two classes. The cheap one; what the old pipeline always used. */
  fast: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
  /** 256x256, six classes. Cleaner hair and shoulders, ~3x the cost. */
  detailed:
    'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
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

export interface SmoothBackgroundOptions extends Record<string, unknown> {
  /** Blur strength in output pixels. Ignored when `imagePath` is set. */
  blurRadius?: number;
  /** A wallpaper to sit behind the person. Wins over `blurRadius`. */
  imagePath?: string;
  /** Neither set means pass the camera through untouched. */
  quality?: ModelQuality;
  settings?: Partial<PipelineSettings>;
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

    this.applyMode();
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
    this.applyMode();
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
      if (this.background?.path !== imagePath) {
        const image = await loadImage(imagePath);
        this.background?.image.close();
        this.background = { path: imagePath, image };
      }
      this.pipeline.setMode({ kind: 'image', image: this.background.image });
      return;
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

      // `segmentForVideo` is synchronous despite the callback, and the callback
      // fires before it returns — so the mask folded in here belongs to this
      // frame, not the last one. It refuses a timestamp that hasn't advanced.
      const timestamp = Math.max(this.lastTimestamp + 1, performance.now());
      this.lastTimestamp = timestamp;
      this.segmenter.segmentForVideo(frame, timestamp, (result) => {
        const masks = result.confidenceMasks;
        const mask = masks?.[0];
        if (mask) {
          // What channel 0 means depends on the model, and getting it backwards
          // replaces the *person* with the wallpaper — which is exactly what
          // happened the first time this ran. A two-class segmenter emits one
          // mask and it is the foreground; a multiclass one emits a mask per
          // category and the first is the background. Read it off the number of
          // masks rather than off which model we think we loaded.
          const invert = masks.length > 1;
          this.pipeline!.updateMask(mask.getAsWebGLTexture(), mask.width, mask.height, invert);
        }
        result.close();
      });

      if (this.pipeline.ready && this.pipeline.render(frame)) {
        controller.enqueue(new VideoFrame(canvas, { timestamp: frame.timestamp ?? 0 }));
        handled = true;
      } else {
        // No mask yet — the first frame or two. Passing the camera through is
        // far better than a black hole where someone's face should be.
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
  const image = new Image();
  image.crossOrigin = 'Anonymous';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = reject;
    image.src = path;
  });
  return createImageBitmap(image);
}

export { DEFAULT_SETTINGS };
export type { PipelineSettings };
