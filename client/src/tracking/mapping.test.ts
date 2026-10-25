import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAPPING,
  LM,
  mapHands,
  mergeControl,
  normalize,
  pinchAperture,
  toScreenX,
  type HandSample,
  type MappingOptions,
  type Point,
} from './mapping';
import { DEFAULT_CONTROL_STATE } from '../control/types';

/** A hand at a given wrist position with a controllable pinch aperture. */
function makeHand(
  handedness: 'Left' | 'Right',
  wrist: Point,
  pinchRatio = 1,
): HandSample {
  const landmarks: Point[] = Array.from({ length: 21 }, () => ({ ...wrist }));
  landmarks[LM.WRIST] = { ...wrist };
  // Hand span of 0.1 in y; thumb/index separated by pinchRatio * span.
  landmarks[LM.MIDDLE_MCP] = { x: wrist.x, y: wrist.y - 0.1 };
  landmarks[LM.THUMB_TIP] = { x: wrist.x, y: wrist.y };
  landmarks[LM.INDEX_TIP] = { x: wrist.x + pinchRatio * 0.1, y: wrist.y };
  return { landmarks, handedness };
}

describe('normalize', () => {
  it('rescales and clamps', () => {
    expect(normalize(5, 0, 10)).toBe(0.5);
    expect(normalize(-1, 0, 10)).toBe(0);
    expect(normalize(99, 0, 10)).toBe(1);
  });

  it('returns 0 for a degenerate range instead of dividing by zero', () => {
    expect(normalize(5, 3, 3)).toBe(0);
  });
});

describe('toScreenX', () => {
  it('flips only when mirrored', () => {
    expect(toScreenX(0.2, true)).toBeCloseTo(0.8);
    expect(toScreenX(0.2, false)).toBeCloseTo(0.2);
  });
});

describe('pinchAperture', () => {
  it('is invariant to hand scale', () => {
    // Same gesture, different distance from camera. If this ever fails, the
    // effect will drift as the performer moves toward or away from the lens.
    const near = makeHand('Left', { x: 0.5, y: 0.5 }, 0.8);
    const far: HandSample = {
      ...near,
      landmarks: near.landmarks.map((p) => ({ x: p.x * 0.4, y: p.y * 0.4 })),
    };
    expect(pinchAperture(far.landmarks, DEFAULT_MAPPING)).toBeCloseTo(
      pinchAperture(near.landmarks, DEFAULT_MAPPING),
      10,
    );
  });

  it('runs closed to open across the configured band', () => {
    const opts: MappingOptions = { ...DEFAULT_MAPPING, pinchMin: 0.25, pinchMax: 1.1 };
    expect(pinchAperture(makeHand('Left', { x: 0.5, y: 0.5 }, 0.1).landmarks, opts)).toBe(0);
    expect(pinchAperture(makeHand('Left', { x: 0.5, y: 0.5 }, 2).landmarks, opts)).toBe(1);
    const mid = pinchAperture(makeHand('Left', { x: 0.5, y: 0.5 }, 0.675).landmarks, opts);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('survives a zero-span hand without returning NaN', () => {
    const degenerate = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    expect(pinchAperture(degenerate, DEFAULT_MAPPING)).toBe(1);
  });
});

describe('mapHands', () => {
  it('maps right-hand x to crossfade in screen space when mirrored', () => {
    // Physical right hand held out to the performer's right lands at LOW raw x;
    // mirrored display puts it on the right of screen, so crossfade must be HIGH.
    const out = mapHands([makeHand('Right', { x: 0.1, y: 0.5 })], DEFAULT_MAPPING);
    expect(out.crossfade).toBeCloseTo(0.9);
  });

  it('does not flip x when the preview is not mirrored', () => {
    const out = mapHands([makeHand('Right', { x: 0.1, y: 0.5 })], {
      ...DEFAULT_MAPPING,
      mirrored: false,
    });
    expect(out.crossfade).toBeCloseTo(0.1);
  });

  it('inverts y for volume so a raised hand is louder', () => {
    const high = mapHands([makeHand('Left', { x: 0.5, y: 0.1 })], DEFAULT_MAPPING);
    const low = mapHands([makeHand('Left', { x: 0.5, y: 0.9 })], DEFAULT_MAPPING);
    expect(high.volume).toBeCloseTo(0.9);
    expect(low.volume).toBeCloseTo(0.1);
    expect(high.volume!).toBeGreaterThan(low.volume!);
  });

  it('omits parameters for hands that are not visible', () => {
    // The held-value contract: a hand leaving frame must not zero its parameter,
    // or stepping out of shot silences the mix.
    const rightOnly = mapHands([makeHand('Right', { x: 0.3, y: 0.5 })], DEFAULT_MAPPING);
    expect(rightOnly.crossfade).toBeDefined();
    expect(rightOnly.volume).toBeUndefined();
    expect(rightOnly.cutoff).toBeUndefined();
    expect(mapHands([], DEFAULT_MAPPING)).toEqual({});
  });

  it('exchanges roles when swapHands is set', () => {
    const hand = makeHand('Right', { x: 0.3, y: 0.5 });
    const swapped = mapHands([hand], { ...DEFAULT_MAPPING, swapHands: true });
    expect(swapped.crossfade).toBeUndefined();
    expect(swapped.volume).toBeDefined();
    expect(swapped.cutoff).toBeDefined();
  });

  it('drives all three parameters from two hands', () => {
    const out = mapHands(
      [makeHand('Right', { x: 0.2, y: 0.5 }), makeHand('Left', { x: 0.8, y: 0.3 }, 0.5)],
      DEFAULT_MAPPING,
    );
    expect(out.crossfade).toBeCloseTo(0.8);
    expect(out.volume).toBeCloseTo(0.7);
    expect(out.cutoff).toBeDefined();
  });

  it('ignores a malformed hand rather than reading past the array', () => {
    const stub: HandSample = { landmarks: [{ x: 0.5, y: 0.5 }], handedness: 'Left' };
    expect(mapHands([stub], DEFAULT_MAPPING)).toEqual({});
  });
});

describe('mergeControl', () => {
  it('holds previous values for absent keys', () => {
    const merged = mergeControl(DEFAULT_CONTROL_STATE, { crossfade: 0.2 });
    expect(merged.crossfade).toBe(0.2);
    expect(merged.volume).toBe(DEFAULT_CONTROL_STATE.volume);
    expect(merged.cutoff).toBe(DEFAULT_CONTROL_STATE.cutoff);
  });

  it('accepts a legitimate zero instead of treating it as missing', () => {
    // `?? ` not `||` — a hand at the far left really does mean crossfade 0.
    const merged = mergeControl(DEFAULT_CONTROL_STATE, { crossfade: 0, volume: 0 });
    expect(merged.crossfade).toBe(0);
    expect(merged.volume).toBe(0);
  });
});
