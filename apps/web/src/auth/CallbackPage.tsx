import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/**
 * Landing route for the Google OAuth redirect. supabase-js parses the session
 * out of the URL automatically (detectSessionInUrl); we just wait for the auth
 * state to resolve, then bounce home.
 */
export function CallbackPage() {
  const { loading, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) navigate(user ? '/app' : '/login', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card auth-centered">
        <div className="auth-spinner" aria-hidden="true" />
        <p>Signing you in…</p>
      </div>
    </div>
  );
}
