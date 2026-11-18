import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { fetchMe, switchRole, type Role, type User } from '../api';

export function Profile() {
  const { token, setToken } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    fetchMe(token)
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load profile');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSwitchRole() {
    if (!token || !user) return;
    const nextRole: Role = user.role === 'Beginner' ? 'Experienced' : 'Beginner';
    setSwitching(true);
    setError('');
    try {
      const { user: updated, token: freshToken } = await switchRole(token, nextRole);
      // The new token carries the new role, so the rest of the app sees it.
      setToken(freshToken);
      setUser(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch role');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Profile</h1>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : !user ? (
        <p className="text-sm text-red-700">{error || 'Profile unavailable.'}</p>
      ) : (
        <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 p-6">
          <Field label="Username" value={user.username} />
          <Field label="Email" value={user.email} />
          <Field label="Role" value={user.role} />

          {error && <p className="text-sm text-red-700">{error}</p>}

          <div className="flex items-center gap-3 border-t border-neutral-200 pt-4">
            <button
              type="button"
              onClick={() => void handleSwitchRole()}
              disabled={switching}
              className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-40"
            >
              {switching
                ? 'Switching…'
                : `Switch to ${user.role === 'Beginner' ? 'Experienced' : 'Beginner'}`}
            </button>
            <span className="text-sm text-neutral-500">
              {user.role === 'Beginner'
                ? 'Experienced unlocks all effects and tracking settings.'
                : 'Beginner limits you to the lowpass filter.'}
            </span>
          </div>
        </section>
      )}
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
