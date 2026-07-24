import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthResult, AuthUser } from './types';

/** Normalize Supabase's rich `User` down to the shape the UI cares about. */
export function toAuthUser(user: User | null | undefined): AuthUser | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const displayName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null;
  return { id: user.id, email: user.email ?? null, displayName };
}

/** Extra sign-up fields stored in Supabase user metadata (and mirrored to profiles). */
export interface SignUpMeta {
  /** Full name → user_metadata.full_name, shown as the display name. */
  fullName?: string;
  /** Unique handle → user_metadata.username, enforced unique on profiles. */
  username?: string;
}

export async function signUpWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
  meta?: SignUpMeta,
): Promise<AuthResult> {
  const data_: Record<string, string> = {};
  if (meta?.fullName) data_.full_name = meta.fullName;
  if (meta?.username) data_.username = meta.username;
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: Object.keys(data_).length ? { data: data_ } : undefined,
  });
  if (error) throw new Error(error.message);
  return { user: toAuthUser(data.user) };
}

export async function signInWithPassword(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<AuthResult> {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return { user: toAuthUser(data.user) };
}

/**
 * Kick off the Google OAuth redirect flow (web). `redirectTo` is where Supabase
 * sends the browser back after consent — the app's callback route. Resolves once
 * the redirect is initiated; the session lands after the round-trip.
 */
export async function signInWithGoogle(
  client: SupabaseClient,
  redirectTo?: string,
): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: redirectTo ? { redirectTo } : undefined,
  });
  if (error) throw new Error(error.message);
}

export async function signOut(client: SupabaseClient): Promise<void> {
  const { error } = await client.auth.signOut();
  if (error) throw new Error(error.message);
}

/** The current user, or null. Reads the persisted session; does not hit the network. */
export async function getCurrentUser(
  client: SupabaseClient,
): Promise<AuthUser | null> {
  const { data } = await client.auth.getSession();
  return toAuthUser(data.session?.user);
}

/**
 * Subscribe to sign-in / sign-out. Returns an unsubscribe function. The callback
 * fires immediately with the current state and again on every change.
 */
export function onAuthChange(
  client: SupabaseClient,
  cb: (user: AuthUser | null) => void,
): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    cb(toAuthUser(session?.user));
  });
  return () => data.subscription.unsubscribe();
}
