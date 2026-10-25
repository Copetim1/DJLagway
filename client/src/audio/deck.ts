/**
 * One deck: a decoded buffer plus transport state.
 *
 * AudioBufferSourceNode is single-use. It cannot be paused, and once stopped it
 * cannot be restarted — a fresh node is required for every play. So "pause" here
 * means stop the node and remember where we were, and "play" means build a new
 * node and start it at that offset. Everything below exists to keep that
 * bookkeeping honest.
 */

export interface DeckInfo {
  name: string;
  duration: number;
  position: number;
  playing: boolean;
  loaded: boolean;
}

export class Deck {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private trackName = '';

  /** ctx.currentTime at which the current source started, minus its start offset. */
  private startedAt = 0;
  /** Where playback resumes from, in seconds into the buffer. */
  private pauseOffset = 0;
  private isPlaying = false;

  private readonly ctx: AudioContext;
  /** Per-deck gain, driven by the crossfader. Owned by the engine. */
  readonly output: GainNode;

  constructor(ctx: AudioContext, output: GainNode) {
    this.ctx = ctx;
    this.output = output;
  }

  async load(file: File): Promise<void> {
    const bytes = await file.arrayBuffer();
    // decodeAudioData detaches the ArrayBuffer it is given, so this instance
    // cannot be reused afterwards. That is fine — we never touch it again.
    this.buffer = await this.ctx.decodeAudioData(bytes);
    this.trackName = file.name;
    this.stop();
  }

  play(): void {
    if (!this.buffer || this.isPlaying) return;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.output);

    // A source that reaches the end of its buffer fires onended, but so does one
    // we stop ourselves. Guard with identity so a stale node cannot clear the
    // state belonging to a newer one.
    source.onended = () => {
      if (this.source !== source) return;
      this.isPlaying = false;
      this.pauseOffset = 0;
      this.source = null;
    };

    source.start(0, this.pauseOffset);
    this.source = source;
    this.startedAt = this.ctx.currentTime - this.pauseOffset;
    this.isPlaying = true;
  }

  pause(): void {
    if (!this.isPlaying) return;
    // Capture the position before tearing the node down; after stop() the clock
    // reference is meaningless.
    this.pauseOffset = this.position;
    this.teardown();
  }

  stop(): void {
    this.teardown();
    this.pauseOffset = 0;
  }

  toggle(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  private teardown(): void {
    const source = this.source;
    this.source = null;
    this.isPlaying = false;
    if (!source) return;
    // Detach the handler first: this stop() is ours, and the handler's job is
    // only to notice a track ending on its own.
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already stopped. Harmless.
    }
    source.disconnect();
  }

  /** Current playhead in seconds, clamped to the buffer length. */
  get position(): number {
    if (!this.buffer) return 0;
    if (!this.isPlaying) return this.pauseOffset;
    const elapsed = this.ctx.currentTime - this.startedAt;
    return Math.min(Math.max(elapsed, 0), this.buffer.duration);
  }

  get info(): DeckInfo {
    return {
      name: this.trackName,
      duration: this.buffer?.duration ?? 0,
      position: this.position,
      playing: this.isPlaying,
      loaded: this.buffer !== null,
    };
  }
}
