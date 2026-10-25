/**
 * The seam between hand tracking and audio.
 *
 * Tracking and audio never import each other. They meet here. That is what lets
 * the gesture pipeline and the audio engine be built and debugged independently,
 * and it is why the manual slider fallback is not a second code path — the sliders
 * are simply a second producer of this same value.
 */

/** Every continuous parameter a performer can drive, normalized to 0..1. */
export interface ControlState {
  /** 0 = deck A alone, 1 = deck B alone. */
  crossfade: number;
  /** Master output level. 0 = silent, 1 = unity. */
  volume: number;
  /** Lowpass position. 0 = heavily filtered, 1 = fully open. */
  cutoff: number;
}

/** Where a ControlState came from. The HUD shows this so it is obvious what is driving audio. */
export type ControlSource = 'gesture' | 'manual';

export const DEFAULT_CONTROL_STATE: ControlState = {
  crossfade: 0.5,
  volume: 0.8,
  cutoff: 1,
};

/**
 * Lowpass sweep range in Hz.
 *
 * The top end sits above the audible band on purpose: at cutoff = 1 the filter
 * should be effectively transparent rather than subtly dulling the mix.
 */
export const CUTOFF_MIN_HZ = 200;
export const CUTOFF_MAX_HZ = 18000;

/**
 * Smoothing time constant for AudioParam.setTargetAtTime, in seconds.
 *
 * Assigning to AudioParam.value in a control loop steps the value instantly and
 * audibly zippers. setTargetAtTime glides instead. 15ms is short enough to feel
 * immediate and long enough to remove the step.
 */
export const PARAM_SMOOTHING_S = 0.015;

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Map a normalized 0..1 position to a filter frequency, logarithmically.
 *
 * Pitch perception is logarithmic: a linear map spends most of the hand's travel
 * in the top octave, where nothing much is heard, and crams the audible part of
 * the sweep into the last few centimetres.
 */
export function cutoffToHz(cutoff: number): number {
  const t = clamp01(cutoff);
  return CUTOFF_MIN_HZ * Math.pow(CUTOFF_MAX_HZ / CUTOFF_MIN_HZ, t);
}

/**
 * Equal-power crossfade gains for decks A and B.
 *
 * A linear crossfade (1-x, x) sums to a audible ~3dB dip at the midpoint, because
 * two uncorrelated sources add by power, not amplitude. The sin/cos pair keeps
 * total power constant across the whole sweep.
 */
export function crossfadeGains(crossfade: number): { a: number; b: number } {
  const x = clamp01(crossfade);
  return {
    a: Math.cos((x * Math.PI) / 2),
    b: Math.sin((x * Math.PI) / 2),
  };
}
