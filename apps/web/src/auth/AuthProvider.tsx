import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getCurrentUser,
  onAuthChange,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  type AuthUser,
} from '@visionds/auth';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { authConfigured, getAuthClient, oauthRedirectTo } from './config';

interface AuthContextValue {
  /** False when no Supabase project is wired up — the app stays usable signed-out. */
  configured: boolean;
  /** True until the initial session check resolves. */
  loading: boolean;
  user: AuthUser | null;
  /** The raw client for data helpers (saveRun, pullCaptures, …); null if unconfigured. */
  client: SupabaseClient | null;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (fields: SignUpFields) => Promise<void>;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

export interface SignUpFields {
  name: string;
  username: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = getAuthClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(authConfigured);

  useEffect(() => {
    if (!client) {
      setLoading(false);
      return;
    }
    let alive = true;
    getCurrentUser(client)
      .then((u) => alive && setUser(u))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    const unsub = onAuthChange(client, (u) => alive && setUser(u));
    return () => {
      alive = false;
      unsub();
    };
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: authConfigured,
      loading,
      user,
      client,
      signInEmail: async (email, password) => {
        if (!client) throw new Error('Sign-in is not configured.');
        await signInWithPassword(client, email, password);
      },
      signUpEmail: async ({ name, username, email, password }) => {
        if (!client) throw new Error('Sign-up is not configured.');
        await signUpWithPassword(client, email, password, {
          fullName: name,
          username,
        });
      },
      signInGoogle: async () => {
        if (!client) throw new Error('Sign-in is not configured.');
        await signInWithGoogle(client, oauthRedirectTo());
      },
      logout: async () => {
        if (!client) return;
        await signOut(client);
      },
    }),
    [client, loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
