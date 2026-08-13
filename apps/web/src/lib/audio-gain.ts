/**
 * Slider position -> actual playback gain.
 *
 * The teacher's per-student volume used to hand its raw fraction straight to
 * `RemoteParticipant.setVolume`, which lands on `HTMLMediaElement.volume` (or a
 * Web Audio gain node) — both of them raw *amplitude*. Amplitude is not
 * loudness: half amplitude is −6 dB, which the ear reads as roughly two thirds
 * as loud. Dragging a student down to 40% and hearing them "almost the same" is
 * the honest result of that, not a wiring fault.
 *
 * So the slider's travel is mapped onto decibels instead, the way every
 * consumer volume control does it. The stored value stays the fraction the
 * teacher chose — the curve is applied at the moment it becomes gain, so room
 * metadata, the API and the slider UI all keep talking in plain percentages.
 */

/** Below this the control means silence, not a whisper. */
const SILENCE_BELOW = 0.02;

/** How much attenuation the slider's travel spans. */
const MIN_DB = -40;

/**
 * @param fraction 0–1, straight off the slider.
 * @returns 0–1 gain: 100% → 1.0, 75% → 0.32, 50% → 0.10, 25% → 0.03, 0% → 0.
 */
export function gainForSlider(fraction: number): number {
  // NaN would sail through the clamp below and reach the audio, where it means
  // "silence" — a garbled metadata value must not mute the class.
  if (!Number.isFinite(fraction)) return 1;
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= SILENCE_BELOW) return 0;
  if (f >= 1) return 1;
  return 10 ** ((MIN_DB * (1 - f)) / 20);
}
