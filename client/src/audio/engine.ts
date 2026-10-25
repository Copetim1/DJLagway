import {
  crossfadeGains,
  cutoffToHz,
  PARAM_SMOOTHING_S,
  type ControlState,
} from '../control/types';
import { Deck } from './deck';

/**
 * The audio graph and its single entry point for control.
 *
 *   deckA -> gainA -\
 *                    >-- lowpass -- master -- destination
 *   deckB -> gainB -/
 *
 * One master filter rather than one per deck: the MVP specifies a single effect,
 * and fewer nodes means less to diagnose when latency is the thing under test.
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly deckA: Deck;
  readonly deckB: Deck;

  private readonly gainA: GainNode;
  private readonly gainB: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly master: GainNode;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });

    this.gainA = this.ctx.createGain();
    this.gainB = this.ctx.createGain();
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    // Leave resonance flat. A resonant peak sounds dramatic but adds gain near
    // the cutoff, which would confound loudness comparisons while tuning.
    this.filter.Q.value = 0.7;
    this.master = this.ctx.createGain();

    this.gainA.connect(this.filter);
    this.gainB.connect(this.filter);
    this.filter.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.deckA = new Deck(this.ctx, this.gainA);
    this.deckB = new Deck(this.ctx, this.gainB);
  }

  /**
   * Browsers create an AudioContext in the suspended state and only allow it to
   * start from a user gesture. Without this the app is silent and throws nothing.
   */
  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  /**
   * The one place control reaches audio. Both the gesture pipeline and the manual
   * sliders call this, which is what keeps the fallback honest.
   */
  apply(state: ControlState): void {
    const now = this.ctx.currentTime;
    const { a, b } = crossfadeGains(state.crossfade);

    // setTargetAtTime, never .value — see PARAM_SMOOTHING_S.
    this.gainA.gain.setTargetAtTime(a, now, PARAM_SMOOTHING_S);
    this.gainB.gain.setTargetAtTime(b, now, PARAM_SMOOTHING_S);
    this.master.gain.setTargetAtTime(state.volume, now, PARAM_SMOOTHING_S);
    this.filter.frequency.setTargetAtTime(cutoffToHz(state.cutoff), now, PARAM_SMOOTHING_S);
  }

  /**
   * Output-side latency in ms, as the browser reports it.
   *
   * baseLatency is the graph's own buffering; outputLatency includes the OS and
   * hardware path. outputLatency is not implemented everywhere, hence the guard.
   */
  get outputLatencyMs(): number {
    const base = this.ctx.baseLatency ?? 0;
    const output = this.ctx.outputLatency ?? 0;
    return (base + output) * 1000;
  }

  async close(): Promise<void> {
    this.deckA.stop();
    this.deckB.stop();
    await this.ctx.close();
  }
}
