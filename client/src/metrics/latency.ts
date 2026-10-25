/**
 * Rolling timing statistics for the go/no-go call.
 *
 * Medians, not means: a single GC pause or a dropped frame skews an average
 * enough to make a responsive pipeline look broken.
 */

export class RollingStat {
  private readonly samples: number[] = [];
  private cursor = 0;
  private readonly capacity: number;

  constructor(capacity = 120) {
    this.capacity = capacity;
  }

  push(value: number): void {
    if (!Number.isFinite(value)) return;
    if (this.samples.length < this.capacity) this.samples.push(value);
    else this.samples[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.capacity;
  }

  get count(): number {
    return this.samples.length;
  }

  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
    return sorted[idx];
  }

  get median(): number {
    return this.percentile(0.5);
  }

  /** p95 matters more than the worst case, which is usually one unlucky frame. */
  get p95(): number {
    return this.percentile(0.95);
  }

  reset(): void {
    this.samples.length = 0;
    this.cursor = 0;
  }
}

export interface LatencySnapshot {
  /** Time inside detectForVideo. */
  inferenceMs: number;
  inferenceP95Ms: number;
  /** Camera capture -> audio param written. Only meaningful when captureTime exists. */
  pipelineMs: number;
  pipelineP95Ms: number;
  /** How often control actually reaches the audio graph. */
  updateHz: number;
  /** ctx.baseLatency + ctx.outputLatency. */
  outputLatencyMs: number;
  /** False on browsers without requestVideoFrameCallback metadata. */
  pipelineMeasurable: boolean;
}

export type Verdict = 'go' | 'tune' | 'stop' | 'unknown';

/**
 * The decision this spike exists to produce.
 *
 * Thresholds come from the plan: under 50ms at 30Hz+ feels like an instrument,
 * 50-100ms is usable but needs tuning, past 100ms the concept needs rethinking
 * before the schedule is committed.
 */
export function verdictFor(snapshot: LatencySnapshot): Verdict {
  if (!snapshot.pipelineMeasurable || snapshot.updateHz === 0) return 'unknown';
  if (snapshot.pipelineMs < 50 && snapshot.updateHz >= 30) return 'go';
  if (snapshot.pipelineMs <= 100) return 'tune';
  return 'stop';
}

export class LatencyTracker {
  private readonly inference = new RollingStat();
  private readonly pipeline = new RollingStat();
  private updateTimes: number[] = [];
  private sawCaptureTime = false;

  recordInference(ms: number): void {
    this.inference.push(ms);
  }

  /**
   * @param captureTime when the camera frame was captured, or null if the
   *                    browser does not expose it. Without it there is no honest
   *                    end-to-end number and the HUD says so rather than
   *                    reporting a flattering partial measurement.
   */
  recordPipeline(captureTime: number | null, appliedAt: number): void {
    if (captureTime !== null) {
      this.sawCaptureTime = true;
      this.pipeline.push(appliedAt - captureTime);
    }
    this.updateTimes.push(appliedAt);
    const cutoff = appliedAt - 1000;
    if (this.updateTimes.length > 240 || this.updateTimes[0] < cutoff) {
      this.updateTimes = this.updateTimes.filter((t) => t >= cutoff);
    }
  }

  snapshot(outputLatencyMs: number): LatencySnapshot {
    return {
      inferenceMs: this.inference.median,
      inferenceP95Ms: this.inference.p95,
      pipelineMs: this.pipeline.median,
      pipelineP95Ms: this.pipeline.p95,
      updateHz: this.updateTimes.length,
      outputLatencyMs,
      pipelineMeasurable: this.sawCaptureTime,
    };
  }

  reset(): void {
    this.inference.reset();
    this.pipeline.reset();
    this.updateTimes = [];
    this.sawCaptureTime = false;
  }
}
