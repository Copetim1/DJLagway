import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { deleteTrack, fetchTracks, uploadTrack, type Track } from '../api';

const ACCEPTED_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'];

/** Accept anything the browser tags as audio, plus a known audio extension as a fallback. */
function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Library() {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    try {
      setTracks(await fetchTracks(token));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function onPickFile(selected: File | null) {
    setUploadError('');
    if (selected && !isAudioFile(selected)) {
      setFile(null);
      setUploadError(`"${selected.name}" is not an audio file. Use ${ACCEPTED_EXTENSIONS.join(', ')}.`);
      return;
    }
    setFile(selected);
    if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ''));
  }

  async function handleUpload() {
    if (!token || !file) return;
    setUploadError('');
    setProgress(0);
    try {
      await uploadTrack(token, file, { title: title.trim() || undefined, artist: artist.trim() || undefined }, setProgress);
      // Reset the form and refresh the list.
      setFile(null);
      setTitle('');
      setArtist('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setProgress(null);
    }
  }

  async function handleDelete(track: Track) {
    if (!token) return;
    const previous = tracks;
    // Optimistic removal; restore on failure.
    setTracks((list) => list.filter((t) => t.id !== track.id));
    try {
      await deleteTrack(token, track.id);
    } catch (err) {
      setTracks(previous);
      setLoadError(err instanceof Error ? err.message : 'Failed to delete track');
    }
  }

  const uploading = progress !== null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Library</h1>

      {/* Upload form */}
      <section className="mb-8 flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
        <h2 className="font-medium">Upload a track</h2>

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          className="text-sm"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Artist</span>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        {uploadError && <p className="text-sm text-red-700">{uploadError}</p>}

        {uploading && (
          <div className="h-2 w-full overflow-hidden rounded bg-neutral-200">
            <div
              className="h-full bg-neutral-900 transition-[width] duration-150"
              style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || uploading}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
        >
          {uploading ? `Uploading… ${Math.round((progress ?? 0) * 100)}%` : 'Upload'}
        </button>
      </section>

      {/* Track list */}
      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-700">{loadError}</p>
      ) : tracks.length === 0 ? (
        <p className="text-sm text-neutral-500">No tracks yet. Upload one above.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {tracks.map((track) => (
            <li key={track.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{track.title}</p>
                <p className="truncate text-sm text-neutral-500">
                  {track.artist}
                  {track.duration ? ` · ${formatDuration(track.duration)}` : ''}
                  {track.ownerId ? '' : ' · starter'}
                </p>
              </div>
              {track.ownerId ? (
                <button
                  type="button"
                  onClick={() => void handleDelete(track)}
                  className="shrink-0 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              ) : (
                <span className="shrink-0 text-xs text-neutral-400">read-only</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
