// Web-side Supabase wiring. The client is a lazy singleton: it's only
// constructed when the two env vars are present, so with no project configured
// the app runs entirely signed-out and no network client ever exists.
//
//   apps/web/.env
//     VITE_SUPABASE_URL=https://<project>.supabase.co
//     VITE_SUPABASE_ANON_KEY=<anon key>

import type { SupabaseClient } from '@supabase/supabase-js';
import { configFromEnv, createAuthClient } from '@visionds/auth';

const cfg = configFromEnv(
  import.meta.env as unknown as Record<string, string | undefined>,
);

/** Whether a Supabase project is wired up. Drives graceful degradation. */
export const authConfigured = cfg !== null;

let cached: SupabaseClient | null = null;

/** The shared client, or null when auth isn't configured. */
export function getAuthClient(): SupabaseClient | null {
  if (!cfg) return null;
  if (!cached) {
    cached = createAuthClient(cfg, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return cached;
}

/** Where Supabase returns the browser after Google consent. */
export function oauthRedirectTo(): string {
  return `${window.location.origin}/auth/callback`;
}
