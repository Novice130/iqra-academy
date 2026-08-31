import type { ModelQuality } from './SmoothBackgroundTransformer';
import type { SegmentationWorkerRequest, SegmentationWorkerResponse } from './protocol';

export interface WorkerMask {
  generation: number;
  sequence: number;
  timestamp: number;
  durationMs: number;
  width: number;
  height: number;
  invert: boolean;
  data: Uint8Array;
}

export class SegmentationWorkerClient {
  private worker: Worker | null = null;
  private busy = false;
  private closed = false;

  constructor(
    private readonly quality: ModelQuality,
    private readonly onMask: (mask: WorkerMask) => void,
    private readonly onError: (message: string) => void
  ) {}

  async init() {
    const worker = new Worker(new URL('./segmentation.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('message', handleMessage);
        reject(new Error('Worker initialization timed out after 3000ms'));
      }, 3000);

      const handleMessage = (event: MessageEvent<SegmentationWorkerResponse>) => {
        const message = event.data;
        if (message.type === 'ready') {
          clearTimeout(timer);
          worker.removeEventListener('message', handleMessage);
          resolve();
        } else if (message.type === 'error' && message.fatal) {
          clearTimeout(timer);
          worker.removeEventListener('message', handleMessage);
          reject(new Error(message.message));
        }
      };

      worker.addEventListener('message', handleMessage);
      worker.addEventListener(
        'error',
        (event) => {
          clearTimeout(timer);
          reject(new Error(event.message || 'Worker syntax/bundle error'));
        },
        { once: true }
      );
      worker.postMessage({ type: 'init', quality: this.quality } satisfies SegmentationWorkerRequest);
    });

    worker.onmessage = (event: MessageEvent<SegmentationWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'mask') {
        this.busy = false;
        this.onMask({ ...message, data: new Uint8Array(message.data) });
      } else if (message.type === 'error') {
        this.busy = false;
        this.onError(message.message);
      }
    };

    worker.onerror = (event) => {
      this.busy = false;
      this.onError(event.message || 'Background segmentation worker failed.');
    };
  }

  segment(frame: VideoFrame, generation: number, sequence: number, timestamp: number) {
    if (!this.worker || this.busy || this.closed) {
      frame.close();
      return false;
    }

    this.busy = true;
    const request: SegmentationWorkerRequest = {
      type: 'segment',
      generation,
      sequence,
      timestamp,
      frame,
    };
    this.worker.postMessage(request, [frame]);
    return true;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.worker?.postMessage({ type: 'close' } satisfies SegmentationWorkerRequest);
    this.worker?.terminate();
    this.worker = null;
    this.busy = false;
  }
}
