import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions,
} from '@supabase/supabase-js';
import type { AuthConfig } from './types';

/**
 * True when both fields of a config are present and non-empty. Callers use this
 * to degrade gracefully: with no Supabase project wired up, the app runs fully
 * signed-out and never constructs a client.
 */
export function isConfigured(
  cfg: Partial<AuthConfig> | null | undefined,
): cfg is AuthConfig {
  return (
    !!cfg &&
    typeof cfg.url === 'string' &&
    cfg.url.length > 0 &&
    typeof cfg.anonKey === 'string' &&
    cfg.anonKey.length > 0
  );
}

/**
 * Read a config from a record of env-like values (Vite's `import.meta.env`, an
 * esbuild `define` object, `process.env`, …). Returns null when either var is
 * missing, so `isConfigured` short-circuits cleanly.
 */
export function configFromEnv(
  env: Record<string, string | undefined>,
): AuthConfig | null {
  const url = env.VITE_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  const cfg = { url: url ?? '', anonKey: anonKey ?? '' };
  return isConfigured(cfg) ? cfg : null;
}

/**
 * Construct a Supabase client. Pass `options.auth.storage` to back sessions with
 * something other than the default (the extension supplies a chrome.storage
 * adapter, for instance). Language-agnostic to the surface using it.
 */
export function createAuthClient(
  cfg: AuthConfig,
  options?: SupabaseClientOptions<'public'>,
): SupabaseClient {
  return createClient(cfg.url, cfg.anonKey, options);
}
