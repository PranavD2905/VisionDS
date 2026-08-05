import { describe, expect, it } from 'vitest';
import { toAuthUser } from './auth';
import { configFromEnv, isConfigured } from './client';

describe('isConfigured', () => {
  it('is true only when both fields are non-empty', () => {
    expect(isConfigured({ url: 'https://x.supabase.co', anonKey: 'k' })).toBe(true);
    expect(isConfigured({ url: '', anonKey: 'k' })).toBe(false);
    expect(isConfigured({ url: 'https://x', anonKey: '' })).toBe(false);
    expect(isConfigured(null)).toBe(false);
    expect(isConfigured(undefined)).toBe(false);
  });
});

describe('configFromEnv', () => {
  it('reads VITE_-prefixed vars', () => {
    expect(
      configFromEnv({
        VITE_SUPABASE_URL: 'https://x.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'anon',
      }),
    ).toEqual({ url: 'https://x.supabase.co', anonKey: 'anon' });
  });

  it('falls back to unprefixed vars', () => {
    expect(
      configFromEnv({ SUPABASE_URL: 'https://x', SUPABASE_ANON_KEY: 'anon' }),
    ).toEqual({ url: 'https://x', anonKey: 'anon' });
  });

  it('returns null when unconfigured (drives signed-out mode)', () => {
    expect(configFromEnv({})).toBeNull();
    expect(configFromEnv({ VITE_SUPABASE_URL: 'https://x' })).toBeNull();
  });
});

describe('toAuthUser', () => {
  it('maps null/undefined to null', () => {
    expect(toAuthUser(null)).toBeNull();
    expect(toAuthUser(undefined)).toBeNull();
  });

  it('prefers full_name, then name, from user metadata', () => {
    const base = { id: 'u1', email: 'a@b.com' } as never;
    expect(
      toAuthUser({ ...(base as object), user_metadata: { full_name: 'Ada L' } } as never),
    ).toEqual({ id: 'u1', email: 'a@b.com', displayName: 'Ada L' });
    expect(
      toAuthUser({ ...(base as object), user_metadata: { name: 'Ada' } } as never),
    ).toEqual({ id: 'u1', email: 'a@b.com', displayName: 'Ada' });
    expect(
      toAuthUser({ ...(base as object), user_metadata: {} } as never),
    ).toEqual({ id: 'u1', email: 'a@b.com', displayName: null });
  });
});
