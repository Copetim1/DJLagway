import type { StarterTrack } from '../api';
import type { DeckInfo } from '../audio/deck';

const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

interface Props {
  label: 'A' | 'B';
  info: DeckInfo;
  tracks: StarterTrack[];
  /** True when the track list could not be fetched. */
  unavailable: boolean;
  selectedId: string;
  loading: boolean;
  onSelect: (track: StarterTrack) => void;
  onToggle: () => void;
}

export function DeckPanel({
  label,
  info,
  tracks,
  unavailable,
  selectedId,
  loading,
  onSelect,
  onToggle,
}: Props) {
  const progress = info.duration > 0 ? info.position / info.duration : 0;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">Deck {label}</h2>
        <span className="tnum text-sm text-neutral-500">
          {formatTime(info.position)} / {formatTime(info.duration)}
        </span>
      </div>

      <select
        value={selectedId}
        disabled={loading || tracks.length === 0}
        onChange={(e) => {
          const track = tracks.find((t) => t.id === e.target.value);
          if (track) onSelect(track);
        }}
        className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
      >
        <option value="" disabled>
          {loading ? 'Loading…' : unavailable ? 'No tracks (backend not running)' : 'Choose a track'}
        </option>
        {tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} — {t.artist}
          </option>
        ))}
      </select>

      <div className="h-1 w-full overflow-hidden rounded bg-neutral-200">
        <div className="h-full bg-neutral-900" style={{ width: `${progress * 100}%` }} />
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={!info.loaded || loading}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {info.playing ? 'Pause' : 'Play'}
      </button>
    </section>
  );
}
