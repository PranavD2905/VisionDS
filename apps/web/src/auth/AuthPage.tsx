import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/** Shared login / signup screen. `mode` picks the copy and which call runs. */
export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { configured, signInEmail, signUpEmail, signInGoogle } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  // Client-side checks so we fail fast before hitting Supabase.
  const validateSignup = (): string | null => {
    if (!name.trim()) return 'Enter your name.';
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
      return 'Username must be 3–20 characters: letters, numbers, or underscores.';
    if (password.length < 6) return 'Password must be at least 6 characters.';
    if (password !== confirm) return 'Passwords don’t match.';
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (isSignup) {
      const problem = validateSignup();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    try {
      if (isSignup) {
        await signUpEmail({
          name: name.trim(),
          username: username.trim(),
          email,
          password,
        });
        setNotice('Check your inbox to confirm your email, then sign in.');
      } else {
        await signInEmail(email, password);
        navigate('/app');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInGoogle();
      // Redirects away; nothing after this runs on success.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-back">
          ← VisionDS
        </Link>
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-sub">
          {isSignup
            ? 'Save your runs and sync captures from the browser extension.'
            : 'Sign in to reach your saved runs and synced captures.'}
        </p>

        {!configured && (
          <div className="auth-warn">
            Accounts aren’t configured on this build. Set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>{' '}
            to enable sign-in. The app works fully without an account.
          </div>
        )}

        <button
          type="button"
          className="auth-google"
          onClick={google}
          disabled={busy || !configured}
        >
          Continue with Google
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <form onSubmit={submit} className="auth-form">
          {isSignup && (
            <>
              <label>
                <span>Name</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={busy || !configured}
                />
              </label>
              <label>
                <span>Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3–20 chars: letters, numbers, _"
                  required
                  disabled={busy || !configured}
                />
              </label>
            </>
          )}
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={busy || !configured}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={busy || !configured}
            />
          </label>
          {isSignup && (
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                disabled={busy || !configured}
              />
            </label>
          )}
          <button type="submit" className="auth-submit" disabled={busy || !configured}>
            {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}

        <p className="auth-switch">
          {isSignup ? (
            <>
              Already have an account? <Link to="/login">Sign in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/signup">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
