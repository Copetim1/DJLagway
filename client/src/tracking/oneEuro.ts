/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012).
 *
 * The central tension of this whole spike: raw landmarks jitter, and smoothing
 * costs lag. A fixed low-pass has to pick one — either a still hand trembles or a
 * moving hand drags. One Euro adapts: it smooths hard when the signal is slow and
 * barely at all when it moves fast, so a resting hand is steady while a fast
 * gesture stays responsive.
 *
 * minCutoff sets the floor (lower = steadier at rest, more lag), beta sets how
 * aggressively it opens up with speed (higher = less lag when moving). Both are
 * exposed in the UI because finding their sweet spot empirically is half the
 * point of building this.
 */

class LowPass {
  private hatPrev: number | null = null;

  filter(value: number, alpha: number): number {
    const hat = this.hatPrev === null ? value : alpha * value + (1 - alpha) * this.hatPrev;
    this.hatPrev = hat;
    return hat;
  }

  get last(): number | null {
    return this.hatPrev;
  }

  reset(): void {
    this.hatPrev = null;
  }
}

export interface OneEuroOptions {
  /** Cutoff at zero speed, Hz. Lower is steadier and laggier. */
  minCutoff: number;
  /** Speed coefficient. Higher cuts lag during fast movement. */
  beta: number;
  /** Cutoff for the derivative estimate itself, Hz. Rarely needs changing. */
  dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroOptions = {
  minCutoff: 1.7,
  beta: 0.012,
  dCutoff: 1,
};

const alphaFor = (cutoff: number, dt: number): number => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuroFilter {
  private readonly xFilter = new LowPass();
  private readonly dxFilter = new LowPass();
  private lastTimestamp: number | null = null;
  private lastRaw: number | null = null;

  private options: OneEuroOptions;

  constructor(options: OneEuroOptions = DEFAULT_ONE_EURO) {
    this.options = options;
  }

  setOptions(options: OneEuroOptions): void {
    this.options = options;
  }

  /**
   * @param value     raw sample
   * @param timestamp milliseconds, monotonic
   */
  filter(value: number, timestamp: number): number {
    if (this.lastTimestamp === null) {
      this.lastTimestamp = timestamp;
      this.lastRaw = value;
      return this.xFilter.filter(value, 1);
    }

    // Guard the dt used for alpha, not the caller's timestamp: duplicate or
    // out-of-order frames would otherwise divide by zero or go negative and
    // produce an alpha outside [0,1], which makes the filter diverge.
    const dtMs = timestamp - this.lastTimestamp;
    const dt = dtMs > 0 ? dtMs / 1000 : 1 / 60;
    this.lastTimestamp = timestamp;

    const derivative = ((value - (this.lastRaw ?? value)) / dt) || 0;
    this.lastRaw = value;
    const edx = this.dxFilter.filter(derivative, alphaFor(this.options.dCutoff, dt));

    const cutoff = this.options.minCutoff + this.options.beta * Math.abs(edx);
    return this.xFilter.filter(value, alphaFor(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTimestamp = null;
    this.lastRaw = null;
  }
}
