import { useCallback, useEffect, useRef, useState } from 'react';
import { Login } from './Login';
import { MainPage } from './MainPage';

/** Log out after this long with no activity. */
const INACTIVITY_LIMIT_MS = 60_000;

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;

/** When the token expires, in ms since epoch, read from its payload. Null if unreadable. */
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(payload));
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

export default function App() {
  // Drop a saved token that has expired, or whose last activity (possibly in a tab
  // that has since closed) was over the limit, so a stale session never flashes the DJ screen.
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem('token');
    const expiresAt = saved ? tokenExpiry(saved) : null;
    const lastActive = Number(localStorage.getItem('lastActivity') ?? 0);
    if (
      saved &&
      expiresAt !== null &&
      expiresAt > Date.now() &&
      Date.now() - lastActive < INACTIVITY_LIMIT_MS
    ) {
      return saved;
    }
    localStorage.removeItem('token');
    return null;
  });

  const logOut = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
  }, []);

  const lastActivityRef = useRef(0);
  const markActive = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Log out after a minute of inactivity. Mouse, keyboard and touch count here;
  // the DJ screen also reports visible hands and playing music via markActive.
  useEffect(() => {
    if (!token) return;
    markActive();
    localStorage.setItem('lastActivity', String(lastActivityRef.current));
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, markActive, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_LIMIT_MS) logOut();
      // Remembered across reloads and closed tabs; see the initial token check above.
      else localStorage.setItem('lastActivity', String(lastActivityRef.current));
    }, 1000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, markActive);
      window.clearInterval(timer);
    };
  }, [token, markActive, logOut]);

  // Log out the moment the token expires.
  useEffect(() => {
    if (!token) return;
    const expiresAt = tokenExpiry(token) ?? 0;
    const timer = window.setTimeout(logOut, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [token, logOut]);

  // Ask the backend whether a saved token is still valid (e.g. JWT_SECRET changed).
  // If the backend can't be reached, keep the session rather than logging out.
  useEffect(() => {
    if (!token) return;
    fetch('/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401 || res.status === 403) logOut();
      })
      .catch(() => {});
  }, [token, logOut]);

  if (!token) {
    return <Login onLoggedIn={() => setToken(localStorage.getItem('token'))} />;
  }

  return <MainPage onLogOut={logOut} onActivity={markActive} />;
}
