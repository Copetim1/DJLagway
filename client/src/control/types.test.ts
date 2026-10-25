import { describe, expect, it } from 'vitest';
import {
  clamp01,
  crossfadeGains,
  cutoffToHz,
  CUTOFF_MAX_HZ,
  CUTOFF_MIN_HZ,
} from './types';

describe('clamp01', () => {
  it('clamps outside the unit range', () => {
    expect(clamp01(-3)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.25)).toBe(0.25);
  });
});

describe('crossfadeGains', () => {
  it('isolates each deck at the extremes', () => {
    expect(crossfadeGains(0)).toEqual({ a: 1, b: 0 });
    const full = crossfadeGains(1);
    expect(full.a).toBeCloseTo(0, 10);
    expect(full.b).toBeCloseTo(1, 10);
  });

  it('holds constant power across the sweep', () => {
    // The whole reason for sin/cos over a linear fade: a linear pair sums to
    // 0.5 power at centre, an audible dip. This must stay at 1.0 throughout.
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const { a, b } = crossfadeGains(x);
      expect(a * a + b * b).toBeCloseTo(1, 10);
    }
  });

  it('is symmetric about the midpoint', () => {
    const mid = crossfadeGains(0.5);
    expect(mid.a).toBeCloseTo(mid.b, 10);
  });

  it('clamps out-of-range input rather than folding the curve back', () => {
    // cos/sin would happily wrap past x=1 and start reducing deck B again.
    expect(crossfadeGains(2)).toEqual(crossfadeGains(1));
    expect(crossfadeGains(-1)).toEqual(crossfadeGains(0));
  });
});

describe('cutoffToHz', () => {
  it('spans the configured range', () => {
    expect(cutoffToHz(0)).toBeCloseTo(CUTOFF_MIN_HZ, 6);
    expect(cutoffToHz(1)).toBeCloseTo(CUTOFF_MAX_HZ, 6);
  });

  it('is logarithmic, so equal travel gives equal musical intervals', () => {
    // A linear map would put the midpoint at ~9100 Hz and waste most of the
    // hand's travel above the audible action.
    const mid = cutoffToHz(0.5);
    expect(mid).toBeCloseTo(Math.sqrt(CUTOFF_MIN_HZ * CUTOFF_MAX_HZ), 6);
    expect(mid).toBeLessThan((CUTOFF_MIN_HZ + CUTOFF_MAX_HZ) / 2);

    const ratioLow = cutoffToHz(0.5) / cutoffToHz(0.25);
    const ratioHigh = cutoffToHz(0.75) / cutoffToHz(0.5);
    expect(ratioLow).toBeCloseTo(ratioHigh, 10);
  });

  it('is monotonic', () => {
    let prev = -Infinity;
    for (let x = 0; x <= 1.0001; x += 0.05) {
      const hz = cutoffToHz(x);
      expect(hz).toBeGreaterThan(prev);
      prev = hz;
    }
  });
});
