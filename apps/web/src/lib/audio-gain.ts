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
 *
 * 2026-09-08: students were reading as too quiet even at 100%, so the top of
 * the scale now *boosts* — 100% means gain 2.0 (+6 dB) instead of unity. On
 * mobile that is a real doubling: remote audio runs through a Web Audio gain
 * node (webAudioMix), which accepts values above 1. On desktop the browser
 * clamps element volume at 1.0, so there the top of the slider just stops
 * boosting rather than distorting. The boost starts below 100% so the curve
 * stays continuous: at f the gain is 2 × 10^(−40(1−f)/20) — 90% ≈ 1.59,
 * 75% ≈ 0.63, 50% ≈ 0.20, 25% ≈ 0.06.
 */

/** Below this the control means silence, not a whisper. */
const SILENCE_BELOW = 0.02;

/** How much attenuation the slider's travel spans below unity. */
const MIN_DB = -40;

/** Gain at the very top of the slider — a +6 dB boost, since students read quiet. */
const MAX_GAIN = 2.0;

/**
 * @param fraction 0–1, straight off the slider.
 * @returns 0–2 gain: 100% → 2.0, 90% → 1.59, 75% → 0.63, 50% → 0.20, 25% → 0.06, 0% → 0.
 */
export function gainForSlider(fraction: number): number {
  // NaN would sail through the clamp below and reach the audio, where it means
  // "silence" — a garbled metadata value must not mute the class.
  if (!Number.isFinite(fraction)) return 1;
  const f = Math.min(1, Math.max(0, fraction));
  if (f <= SILENCE_BELOW) return 0;
  if (f >= 1) return MAX_GAIN;
  return MAX_GAIN * 10 ** ((MIN_DB * (1 - f)) / 20);
}
