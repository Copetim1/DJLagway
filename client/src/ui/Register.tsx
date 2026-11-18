import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { Role } from '../api';

export function Register() {
  const { logIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('Beginner');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Registration failed');
        return;
      }

      // Register doesn't return a token, so log in right away with the same
      // credentials. If that somehow fails, fall back to the login page.
      const loginRes = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json();

      if (loginRes.ok && loginData.token) {
        logIn(loginData.token);
        navigate('/mix', { replace: true });
      } else {
        navigate('/login', { replace: true });
      }
    } catch {
      setError('Could not reach the server. Is it running?');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-box" onSubmit={handleSubmit}>
        <h1 className="login-title">Create account</h1>

        <label className="login-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          className="login-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label className="login-label" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          type="text"
          className="login-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label className="login-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <span className="login-label">Experience level</span>
        <div className="role-select-group">
          {(['Beginner', 'Experienced'] as const).map((option) => (
            <label key={option} className={`role-option ${role === option ? 'role-option-active' : ''}`}>
              <input
                type="radio"
                name="role"
                value={option}
                checked={role === option}
                onChange={() => setRole(option)}
              />
              <span className="role-option-title">{option}</span>
              <span className="role-option-desc">
                {option === 'Beginner'
                  ? 'Lowpass filter only, simplified controls.'
                  : 'All effects and tracking settings unlocked.'}
              </span>
            </label>
          ))}
        </div>

        {error && <p className="login-error">{error}</p>}

        <button type="submit" className="login-button" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>

        <p className="login-switch">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
