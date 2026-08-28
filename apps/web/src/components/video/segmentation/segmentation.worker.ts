import * as vision from '@mediapipe/tasks-vision';
import type { ModelQuality } from './SmoothBackgroundTransformer';
import type { SegmentationWorkerRequest, SegmentationWorkerResponse } from './protocol';

const WASM_BASE = '/mediapipe/wasm';
const MODELS: Record<ModelQuality, string> = {
  fast: '/mediapipe/models/selfie_segmenter.tflite',
  detailed: '/mediapipe/models/selfie_multiclass_256x256.tflite',
};
const INFERENCE_SIZE: Record<ModelQuality, { width: number; height: number }> = {
  fast: { width: 256, height: 144 },
  detailed: { width: 256, height: 256 },
};

let segmenter: vision.ImageSegmenter | null = null;
let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let quality: ModelQuality = 'fast';
let closed = false;

function send(message: SegmentationWorkerResponse, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

async function createSegmenter(delegate: 'GPU' | 'CPU') {
  const size = INFERENCE_SIZE[quality];
  canvas = new OffscreenCanvas(size.width, size.height);
  context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not create the segmentation canvas.');

  const files = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
  segmenter = await vision.ImageSegmenter.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: MODELS[quality],
      ...(delegate === 'GPU' ? { delegate: 'GPU' as const } : {}),
    },
    canvas,
    runningMode: 'VIDEO',
    outputCategoryMask: false,
    outputConfidenceMasks: true,
  });
}

async function initialize(nextQuality: ModelQuality) {
  quality = nextQuality;
  try {
    await createSegmenter('GPU');
    send({ type: 'ready', delegate: 'GPU' });
  } catch {
    await segmenter?.close();
    segmenter = null;
    await createSegmenter('CPU');
    send({ type: 'ready', delegate: 'CPU' });
  }
}

function segment(request: Extract<SegmentationWorkerRequest, { type: 'segment' }>) {
  const frame = request.frame;
  try {
    if (!segmenter || !canvas || !context) throw new Error('Background segmenter is not ready.');
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const startedAt = performance.now();
    segmenter.segmentForVideo(canvas, request.timestamp, (result) => {
      try {
        const masks = result.confidenceMasks;
        const mask = masks?.[0];
        if (!mask) throw new Error('Background segmenter returned no mask.');
        const source = mask.getAsUint8Array();
        const data = new Uint8Array(source);
        send(
          {
            type: 'mask',
            generation: request.generation,
            sequence: request.sequence,
            timestamp: request.timestamp,
            durationMs: performance.now() - startedAt,
            width: mask.width,
            height: mask.height,
            invert: masks.length > 1,
            data: data.buffer,
          },
          [data.buffer]
        );
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Background segmentation failed.',
          fatal: false,
        });
      } finally {
        result.close();
      }
    });
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : 'Background segmentation failed.',
      fatal: false,
    });
  } finally {
    frame.close();
  }
}

self.onmessage = async (event: MessageEvent<SegmentationWorkerRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    try {
      await initialize(request.quality);
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof Error ? error.message : 'Background segmenter could not start.',
        fatal: true,
      });
    }
  } else if (request.type === 'segment' && !closed) {
    segment(request);
  } else if (request.type === 'close') {
    closed = true;
    await segmenter?.close();
    segmenter = null;
    canvas = null;
    context = null;
    self.close();
  }
};
