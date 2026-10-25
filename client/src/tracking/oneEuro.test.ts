import { describe, expect, it } from 'vitest';
import { DEFAULT_ONE_EURO, OneEuroFilter } from './oneEuro';

/** Feed a signal at a fixed rate and collect the filtered output. */
function run(
  filter: OneEuroFilter,
  samples: number[],
  stepMs = 1000 / 60,
  startMs = 1000,
): number[] {
  return samples.map((v, i) => filter.filter(v, startMs + i * stepMs));
}

describe('OneEuroFilter', () => {
  it('passes the first sample through untouched', () => {
    expect(new OneEuroFilter().filter(0.42, 1000)).toBeCloseTo(0.42, 10);
  });

  it('suppresses jitter on a stationary signal', () => {
    const jitter = Array.from({ length: 120 }, (_, i) => 0.5 + (i % 2 ? 0.02 : -0.02));
    const out = run(new OneEuroFilter(), jitter).slice(60);
    const spread = Math.max(...out) - Math.min(...out);
    // Raw peak-to-peak is 0.04; anything close to that means no smoothing at all.
    expect(spread).toBeLessThan(0.02);
    for (const v of out) expect(v).toBeCloseTo(0.5, 1);
  });

  it('tracks a fast ramp without falling far behind', () => {
    // The adaptive half of the filter: heavy smoothing here would lag visibly.
    const ramp = Array.from({ length: 30 }, (_, i) => i / 29);
    const out = run(new OneEuroFilter(), ramp);
    expect(out[out.length - 1]).toBeGreaterThan(0.8);
  });

  it('lags less on a fast ramp than a jitter-only filter would', () => {
    const ramp = Array.from({ length: 30 }, (_, i) => i / 29);
    const adaptive = run(new OneEuroFilter(DEFAULT_ONE_EURO), ramp);
    const fixed = run(new OneEuroFilter({ ...DEFAULT_ONE_EURO, beta: 0 }), ramp);
    // beta is what buys back responsiveness during motion.
    expect(adaptive[adaptive.length - 1]).toBeGreaterThanOrEqual(fixed[fixed.length - 1]);
  });

  it('converges to a constant input', () => {
    const out = run(new OneEuroFilter(), Array(200).fill(0.75));
    expect(out[out.length - 1]).toBeCloseTo(0.75, 4);
  });

  it('stays finite when timestamps repeat or go backwards', () => {
    // rAF and rVFC can hand back the same millisecond twice; a raw dt of 0 would
    // divide by zero and send alpha to NaN, wedging the filter permanently.
    const filter = new OneEuroFilter();
    filter.filter(0.5, 1000);
    for (const t of [1000, 1000, 999, 1000]) {
      expect(Number.isFinite(filter.filter(0.6, t))).toBe(true);
    }
    expect(Number.isFinite(filter.filter(0.6, 1016))).toBe(true);
  });

  it('forgets its history on reset', () => {
    const filter = new OneEuroFilter();
    run(filter, Array(60).fill(0.9));
    filter.reset();
    expect(filter.filter(0.1, 5000)).toBeCloseTo(0.1, 10);
  });

  it('honours updated options', () => {
    const filter = new OneEuroFilter();
    filter.setOptions({ ...DEFAULT_ONE_EURO, minCutoff: 0.05, beta: 0 });
    const out = run(filter, Array(30).fill(1).map((_, i) => (i === 0 ? 0 : 1)));
    // A very low cutoff must move slowly toward the step.
    expect(out[out.length - 1]).toBeLessThan(0.9);
  });
});
