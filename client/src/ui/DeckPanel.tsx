import { useRef } from 'react';
import type { DeckInfo } from '../audio/deck';

const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  label: 'A' | 'B';
  info: DeckInfo;
  /** Post-crossfade contribution of this deck, 0..1, for the level bar. */
  gain: number;
  onLoad: (file: File) => void;
  onToggle: () => void;
}

export function DeckPanel({ label, info, gain, onLoad, onToggle }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const accent = label === 'A' ? 'var(--color-deck-a)' : 'var(--color-deck-b)';
  const progress = info.duration > 0 ? info.position / info.duration : 0;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-edge bg-panel p-4">
      <header className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-wide" style={{ color: accent }}>
          Deck {label}
        </span>
        <span className="tnum text-xs text-slate-400">
          {formatTime(info.position)} / {formatTime(info.duration)}
        </span>
      </header>

      <p className="truncate text-sm text-slate-300" title={info.name}>
        {info.loaded ? info.name : 'No track loaded'}
      </p>

      {/* Playhead */}
      <div className="h-1 w-full overflow-hidden rounded bg-edge">
        <div
          className="h-full transition-[width] duration-100"
          style={{ width: `${progress * 100}%`, background: accent }}
        />
      </div>

      {/* Contribution to the mix after crossfade — makes the equal-power curve visible. */}
      <div className="flex items-center gap-2">
        <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">
          Level
        </span>
        <div className="h-2 flex-1 overflow-hidden rounded bg-edge">
          <div
            className="h-full"
            style={{ width: `${gain * 100}%`, background: accent, opacity: 0.85 }}
          />
        </div>
        <span className="tnum w-9 shrink-0 text-right text-[10px] text-slate-500">
          {Math.round(gain * 100)}%
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex-1 rounded-lg border border-edge px-3 py-2 text-sm text-slate-200 transition hover:bg-edge"
        >
          Load track
        </button>
        <button
          type="button"
          onClick={onToggle}
          disabled={!info.loaded}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-stage transition disabled:cursor-not-allowed disabled:opacity-30"
          style={{ background: accent }}
        >
          {info.playing ? 'Pause' : 'Play'}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoad(file);
          // Reset so re-selecting the same file fires change again.
          e.target.value = '';
        }}
      />
    </section>
  );
}
