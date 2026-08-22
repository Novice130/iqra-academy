/**
 * Background effects, packaged the same way `@livekit/track-processors` packages
 * its own: a processor you hand to `track.setProcessor()`, with `switchTo` for
 * changing effect without tearing the camera down.
 *
 * Same surface as before deliberately — the call screen and the pre-join screen
 * both drive this, and neither should have to know which pipeline is behind it.
 */

import { ProcessorWrapper } from '@livekit/track-processors';
import SmoothBackgroundTransformer, {
  DEFAULT_QUALITY,
  type ModelQuality,
  type PipelineSettings,
  type SmoothBackgroundOptions,
} from './SmoothBackgroundTransformer';

export type BackgroundEffectOptions =
  | { mode: 'disabled' }
  | { mode: 'background-blur'; blurRadius: number }
  | { mode: 'virtual-background'; imagePath: string };

function toTransformerOptions(options: BackgroundEffectOptions): SmoothBackgroundOptions {
  // Every key is spelled out on every switch, including as `undefined`. The
  // transformer merges options rather than replacing them, so leaving a key off
  // means "keep the old value" — which is how you end up blurring behind a
  // wallpaper someone just turned off.
  switch (options.mode) {
    case 'background-blur':
      return { blurRadius: options.blurRadius, imagePath: undefined };
    case 'virtual-background':
      return { blurRadius: undefined, imagePath: options.imagePath };
    default:
      return { blurRadius: undefined, imagePath: undefined };
  }
}

export class BackgroundProcessor extends ProcessorWrapper<
  SmoothBackgroundOptions,
  SmoothBackgroundTransformer
> {
  constructor(
    options: BackgroundEffectOptions & {
      settings?: Partial<PipelineSettings>;
      /** Overrides the automatic pick. Only the bench passes this. */
      quality?: ModelQuality;
      /** Called when an effect degrades — a wallpaper that would not load. */
      onError?: (message: string) => void;
    }
  ) {
    super(
      new SmoothBackgroundTransformer({
        ...toTransformerOptions(options),
        settings: options.settings,
        quality: options.quality,
        onError: options.onError,
      }),
      'nt-background'
    );
  }

  /** Changes effect in place. Re-creating the processor drops the camera. */
  async switchTo(options: BackgroundEffectOptions) {
    await this.updateTransformerOptions(toTransformerOptions(options));
  }
}

export function createBackgroundProcessor(options: BackgroundEffectOptions): BackgroundProcessor {
  return new BackgroundProcessor(options);
}

export function supportsBackgroundEffects(): boolean {
  return SmoothBackgroundTransformer.isSupported && ProcessorWrapper.isSupported;
}

export { DEFAULT_QUALITY };
export type { ModelQuality, PipelineSettings };
