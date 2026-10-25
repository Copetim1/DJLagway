import { clamp01, type ControlState } from '../control/types';

/**
 * Landmarks -> control parameters. Pure, and deliberately ignorant of MediaPipe.
 *
 * The structural types below mirror the shape of HandLandmarkerResult without
 * importing it, so these functions can be unit-tested in Node without loading a
 * 7MB model and a WASM runtime.
 */

export interface Point {
  x: number;
  y: number;
}

export type Handedness = 'Left' | 'Right';

export interface HandSample {
  /** 21 landmarks in MediaPipe order, normalized to the raw (unmirrored) image. */
  landmarks: Point[];
  /** As reported by the model, in the image's frame of reference. */
  handedness: Handedness;
}

/** MediaPipe hand landmark indices we actually use. */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
} as const;

export interface MappingOptions {
  /**
   * True when the camera preview is displayed mirrored (selfie view).
   *
   * This is the setting that silently inverts the crossfader if it is wrong.
   * The camera sees you face-on, so your physical right hand lands at a LOW x in
   * the raw image. Displaying the video flipped puts it back on the right of the
   * screen, where you expect it. Control has to use that same flipped coordinate,
   * or the on-screen hand and the fader move in opposite directions.
   */
  mirrored: boolean;
  /**
   * Swap which physical hand owns which parameter.
   *
   * MediaPipe's handedness label assumes a particular mirroring convention, and
   * which one it assumes has shifted between releases. Rather than hardcode a
   * guess, this is a toggle: if the hands feel backwards, flip it. Verify against
   * a real webcam before trusting either setting.
   */
  swapHands: boolean;
  /** Normalized pinch distance treated as fully closed. */
  pinchMin: number;
  /** Normalized pinch distance treated as fully open. */
  pinchMax: number;
}

export const DEFAULT_MAPPING: MappingOptions = {
  mirrored: true,
  swapHands: false,
  pinchMin: 0.25,
  pinchMax: 1.1,
};

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Rescale v from [lo,hi] onto [0,1], clamped. Tolerates an inverted range. */
export function normalize(v: number, lo: number, hi: number): number {
  if (hi === lo) return 0;
  return clamp01((v - lo) / (hi - lo));
}

/**
 * Pinch aperture, scale-invariant.
 *
 * Raw thumb-to-index distance shrinks as the performer steps back from the
 * camera, which would make the effect drift with body position. Dividing by the
 * hand's own span (wrist to middle knuckle) cancels that out, so the gesture
 * means the same thing at any distance.
 */
export function pinchAperture(landmarks: Point[], opts: MappingOptions): number {
  const handSpan = distance(landmarks[LM.WRIST], landmarks[LM.MIDDLE_MCP]);
  if (handSpan <= 0) return 1;
  const raw = distance(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]) / handSpan;
  return normalize(raw, opts.pinchMin, opts.pinchMax);
}

/** Apply preview mirroring to a raw-image x coordinate. */
export const toScreenX = (x: number, mirrored: boolean): number => (mirrored ? 1 - x : x);

/**
 * Which role a detected hand plays.
 *
 * Right hand: horizontal position drives the crossfader.
 * Left hand: height drives volume, pinch drives the filter.
 */
function roleOf(hand: HandSample, opts: MappingOptions): 'crossfade' | 'volumeAndFilter' {
  const isRight = hand.handedness === 'Right';
  const effective = opts.swapHands ? !isRight : isRight;
  return effective ? 'crossfade' : 'volumeAndFilter';
}

/**
 * Map the current frame's hands onto whichever parameters they determine.
 *
 * Returns a partial: a hand that is not visible yields no entry for its
 * parameters, so the caller holds the previous value. Snapping an untracked
 * parameter to zero would mean a hand leaving frame silences the mix.
 */
export function mapHands(
  hands: HandSample[],
  opts: MappingOptions = DEFAULT_MAPPING,
): Partial<ControlState> {
  const out: Partial<ControlState> = {};

  for (const hand of hands) {
    if (hand.landmarks.length <= LM.MIDDLE_MCP) continue;
    const wrist = hand.landmarks[LM.WRIST];

    if (roleOf(hand, opts) === 'crossfade') {
      out.crossfade = clamp01(toScreenX(wrist.x, opts.mirrored));
    } else {
      // Image y grows downward; a raised hand should mean louder, so invert.
      out.volume = clamp01(1 - wrist.y);
      out.cutoff = pinchAperture(hand.landmarks, opts);
    }
  }

  return out;
}

/** Merge a partial frame result over the previous state. */
export function mergeControl(prev: ControlState, update: Partial<ControlState>): ControlState {
  return {
    crossfade: update.crossfade ?? prev.crossfade,
    volume: update.volume ?? prev.volume,
    cutoff: update.cutoff ?? prev.cutoff,
  };
}
