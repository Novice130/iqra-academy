import type { ModelQuality } from './SmoothBackgroundTransformer';

export type SegmentationWorkerRequest =
  | { type: 'init'; quality: ModelQuality }
  | { type: 'segment'; generation: number; sequence: number; timestamp: number; frame: VideoFrame }
  | { type: 'close' };

export type SegmentationWorkerResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | {
      type: 'mask';
      generation: number;
      sequence: number;
      timestamp: number;
      durationMs: number;
      width: number;
      height: number;
      invert: boolean;
      data: ArrayBuffer;
    }
  | { type: 'error'; message: string; fatal: boolean };
