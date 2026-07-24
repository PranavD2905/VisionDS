// Supabase client for the extension. Sessions live in chrome.storage.local
// (async, shared across popup opens) rather than localStorage. Config is
// injected at build time by build.mjs; when absent, the extension runs
// auth-free and falls back to the URL-hash handoff.

import { createAuthClient, isConfigured } from '@visionds/auth';

// Replaced at build time via esbuild `define`.
const config = { url: __SUPABASE_URL__, anonKey: __SUPABASE_ANON_KEY__ };

export const authConfigured = isConfigured(config);

/** chrome.storage.local exposed as the async Storage shape Supabase expects. */
const chromeStorage = {
  getItem: (key) =>
    chrome.storage.local.get(key).then((r) => r[key] ?? null),
  setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
  removeItem: (key) => chrome.storage.local.remove(key),
};

let cached = null;

/** The shared client, or null when the build has no Supabase config. */
export function getClient() {
  if (!authConfigured) return null;
  if (!cached) {
    cached = createAuthClient(config, {
      auth: {
        storage: chromeStorage,
        persistSession: true,
        autoRefreshToken: true,
        // The popup has no redirect page; we drive OAuth via chrome.identity.
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });
  }
  return cached;
}
