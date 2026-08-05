// Per-user data access. Every query here is guarded by Row-Level Security in
// Postgres (`user_id = auth.uid()`), so these helpers never filter by user
// themselves — the database refuses rows that aren't the caller's.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CaptureInput,
  CaptureRow,
  ProfileRow,
  RunInput,
  RunRow,
} from './types';

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

// ---------------------------------------------------------------------------
// runs — saved dry-run history
// ---------------------------------------------------------------------------

export async function saveRun(
  client: SupabaseClient,
  run: RunInput,
): Promise<RunRow> {
  const { data } = await client.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('Sign in to save runs.');
  return unwrap(
    await client
      .from('runs')
      .insert({
        user_id: userId,
        language: run.language,
        code: run.code,
        testcases: run.testcases,
        problem: run.problem ?? null,
        verdict: run.verdict ?? null,
      })
      .select()
      .single(),
  ) as RunRow;
}

export async function listRuns(
  client: SupabaseClient,
  limit = 50,
): Promise<RunRow[]> {
  return unwrap(
    await client
      .from('runs')
      .select()
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as RunRow[];
}

export async function getRun(
  client: SupabaseClient,
  id: string,
): Promise<RunRow | null> {
  const { data, error } = await client
    .from('runs')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RunRow) ?? null;
}

export async function deleteRun(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client.from('runs').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// captures — extension → web sync
// ---------------------------------------------------------------------------

/** Extension side: push a LeetCode capture to the signed-in user's account. */
export async function pushCapture(
  client: SupabaseClient,
  capture: CaptureInput,
): Promise<CaptureRow> {
  const { data } = await client.auth.getUser();
  const userId = data.user?.id;
  if (!userId) throw new Error('Sign in to sync captures.');
  return unwrap(
    await client
      .from('captures')
      .insert({
        user_id: userId,
        language: capture.language,
        code: capture.code,
        testcases: capture.testcases,
        problem: capture.problem ?? null,
      })
      .select()
      .single(),
  ) as CaptureRow;
}

/** Web side: the most recent unconsumed captures, newest first. */
export async function pullCaptures(
  client: SupabaseClient,
  limit = 10,
): Promise<CaptureRow[]> {
  return unwrap(
    await client
      .from('captures')
      .select()
      .is('consumed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
  ) as CaptureRow[];
}

/** Mark a capture handled so it doesn't resurface. */
export async function consumeCapture(
  client: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await client
    .from('captures')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// profiles — explainer gating
// ---------------------------------------------------------------------------

export async function getProfile(
  client: SupabaseClient,
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from('profiles')
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ProfileRow) ?? null;
}

/**
 * Atomically bump the explainer usage counter and return the new count.
 * Backed by a Postgres RPC (`increment_explain_count`) so the increment is
 * race-free and can enforce `explain_limit` server-side.
 */
export async function incrementExplainCount(
  client: SupabaseClient,
): Promise<number> {
  const { data, error } = await client.rpc('increment_explain_count');
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}
