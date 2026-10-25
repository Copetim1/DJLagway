import { describe, expect, it } from 'vitest';
import { LatencyTracker, RollingStat, verdictFor, type LatencySnapshot } from './latency';

const snapshot = (over: Partial<LatencySnapshot> = {}): LatencySnapshot => ({
  inferenceMs: 8,
  inferenceP95Ms: 12,
  pipelineMs: 30,
  pipelineP95Ms: 45,
  updateHz: 60,
  outputLatencyMs: 10,
  pipelineMeasurable: true,
  ...over,
});

describe('RollingStat', () => {
  it('reports the median', () => {
    const stat = new RollingStat();
    [5, 1, 3, 2, 4].forEach((v) => stat.push(v));
    expect(stat.median).toBe(3);
  });

  it('is unmoved by a single outlier', () => {
    // Why medians: one GC pause should not make a healthy pipeline read as broken.
    const stat = new RollingStat();
    for (let i = 0; i < 50; i++) stat.push(10);
    stat.push(5000);
    expect(stat.median).toBe(10);
  });

  it('evicts oldest samples past capacity', () => {
    const stat = new RollingStat(4);
    [1, 1, 1, 1, 9, 9, 9, 9].forEach((v) => stat.push(v));
    expect(stat.count).toBe(4);
    expect(stat.median).toBe(9);
  });

  it('ignores non-finite samples', () => {
    const stat = new RollingStat();
    stat.push(NaN);
    stat.push(Infinity);
    expect(stat.count).toBe(0);
    expect(stat.median).toBe(0);
  });

  it('returns 0 when empty rather than NaN', () => {
    expect(new RollingStat().median).toBe(0);
    expect(new RollingStat().p95).toBe(0);
  });
});

describe('verdictFor', () => {
  it('says go for a fast, high-rate pipeline', () => {
    expect(verdictFor(snapshot({ pipelineMs: 30, updateHz: 60 }))).toBe('go');
  });

  it('says tune in the middle band', () => {
    expect(verdictFor(snapshot({ pipelineMs: 75 }))).toBe('tune');
  });

  it('says tune when fast but under-sampled', () => {
    // 20Hz of control is choppy even if each frame arrives quickly.
    expect(verdictFor(snapshot({ pipelineMs: 30, updateHz: 20 }))).toBe('tune');
  });

  it('says stop past the threshold', () => {
    expect(verdictFor(snapshot({ pipelineMs: 140 }))).toBe('stop');
  });

  it('refuses to judge without measurable end-to-end timing', () => {
    expect(verdictFor(snapshot({ pipelineMeasurable: false }))).toBe('unknown');
    expect(verdictFor(snapshot({ updateHz: 0 }))).toBe('unknown');
  });
});

describe('LatencyTracker', () => {
  it('marks the pipeline unmeasurable until a captureTime arrives', () => {
    const tracker = new LatencyTracker();
    tracker.recordInference(9);
    tracker.recordPipeline(null, 1000);
    expect(tracker.snapshot(5).pipelineMeasurable).toBe(false);

    tracker.recordPipeline(980, 1000);
    expect(tracker.snapshot(5).pipelineMeasurable).toBe(true);
  });

  it('computes pipeline time from capture to application', () => {
    const tracker = new LatencyTracker();
    for (let i = 0; i < 10; i++) tracker.recordPipeline(1000 + i * 16, 1020 + i * 16);
    expect(tracker.snapshot(0).pipelineMs).toBeCloseTo(20, 6);
  });

  it('counts update rate only within the last second', () => {
    const tracker = new LatencyTracker();
    for (let i = 0; i < 30; i++) tracker.recordPipeline(null, 500 + i);
    // These are far enough ahead that the earlier batch falls out of the window.
    for (let i = 0; i < 12; i++) tracker.recordPipeline(null, 5000 + i * 10);
    expect(tracker.snapshot(0).updateHz).toBe(12);
  });

  it('passes output latency through untouched', () => {
    expect(new LatencyTracker().snapshot(23.5).outputLatencyMs).toBe(23.5);
  });

  it('clears everything on reset', () => {
    const tracker = new LatencyTracker();
    tracker.recordInference(12);
    tracker.recordPipeline(900, 1000);
    tracker.reset();
    const s = tracker.snapshot(0);
    expect(s.inferenceMs).toBe(0);
    expect(s.updateHz).toBe(0);
    expect(s.pipelineMeasurable).toBe(false);
  });
});
