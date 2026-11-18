import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchMixSessions, type MixSession } from '../api';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Session length from started/ended timestamps, as m:ss. Blank if not computable. */
function formatSessionDuration(session: MixSession): string {
  if (!session.endedAt) return '—';
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const secs = Math.round((end - start) / 1000);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

const trackLabel = (t: MixSession['trackA']) => (t ? `${t.title} — ${t.artist}` : 'Unknown track');

export function Journal() {
  const { token } = useAuth();
  const [sessions, setSessions] = useState<MixSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetchMixSessions(token)
      .then((list) => {
        if (!cancelled) setSessions(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load mix history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Journal</h1>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-neutral-500">No mix sessions logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sessions.map((session) => (
            <li key={session.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <span className="text-sm text-neutral-500">{formatDate(session.startedAt)}</span>
                <span className="tnum text-sm text-neutral-500">
                  {formatSessionDuration(session)}
                </span>
              </div>
              <p className="font-medium">{trackLabel(session.trackA)}</p>
              <p className="font-medium">{trackLabel(session.trackB)}</p>
              {session.effectUsed && (
                <span className="mt-2 inline-block rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                  {session.effectUsed}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
