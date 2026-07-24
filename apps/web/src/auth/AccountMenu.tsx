import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

/** Initials for the avatar chip — from display name, else the email. */
function initials(name: string | null, email: string | null): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? parts[parts.length - 1]![0] : '';
  return (first + second).toUpperCase();
}

/**
 * Header account control. Hidden entirely when auth isn't configured, so builds
 * without Supabase show no dangling "sign in" affordance.
 */
export function AccountMenu() {
  const { configured, loading, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  if (!configured || loading) return null;

  if (!user) {
    return (
      <Link to="/login" className="account-signin">
        Sign in
      </Link>
    );
  }

  const onSignOut = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div className="account-menu" ref={ref}>
      <button
        className="account-avatar"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.email ?? undefined}
      >
        {initials(user.displayName, user.email)}
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-id">
            {user.displayName && <strong>{user.displayName}</strong>}
            <span>{user.email}</span>
          </div>
          <Link to="/history" role="menuitem" onClick={() => setOpen(false)}>
            Run history
          </Link>
          <button role="menuitem" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
