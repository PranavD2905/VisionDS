// Shared types for VisionDS auth + per-user data.
//
// This package is environment-agnostic on purpose: the web app feeds it Vite
// env vars, the extension feeds it esbuild-defined constants, and tests feed it
// literals. Nothing here reaches for `import.meta.env` or `process.env`.

import type { TestCase } from '@visionds/trace-schema';

/** Connection config for a Supabase project. Both fields are public-safe. */
export interface AuthConfig {
  url: string;
  /** The Supabase anon/public key — safe to ship to clients (RLS guards data). */
  anonKey: string;
}

/** The minimal user shape the UI needs; a subset of Supabase's `User`. */
export interface AuthUser {
  id: string;
  email: string | null;
  /** From OAuth providers / user metadata when present. */
  displayName: string | null;
}

/** What a sign-in/up call resolves to. `user` is null while awaiting email confirmation. */
export interface AuthResult {
  user: AuthUser | null;
}

// ---------------------------------------------------------------------------
// Database rows (mirror the SQL migration). Kept in sync with
// supabase/migrations/*.sql — the schema there is the source of truth.
// ---------------------------------------------------------------------------

/** A saved dry-run: enough to reproduce the trace locally, never the trace itself. */
export interface RunRow {
  id: string;
  user_id: string;
  language: string;
  code: string;
  testcases: TestCase[];
  problem: RunProblem | null;
  verdict: string | null;
  created_at: string;
}

export interface RunProblem {
  title?: string;
  slug?: string;
  url?: string;
}

/** Fields the client supplies when saving a run; the rest are server-defaulted. */
export interface RunInput {
  language: string;
  code: string;
  testcases: TestCase[];
  problem?: RunProblem | null;
  verdict?: string | null;
}

/** A capture pushed by the signed-in extension, pulled by the web app. */
export interface CaptureRow {
  id: string;
  user_id: string;
  language: string;
  code: string;
  testcases: TestCase[];
  problem: RunProblem | null;
  consumed_at: string | null;
  created_at: string;
}

export interface CaptureInput {
  language: string;
  code: string;
  testcases: TestCase[];
  problem?: RunProblem | null;
}

/** Per-user metadata + explainer usage gating. */
export interface ProfileRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  explain_count: number;
  explain_limit: number | null;
}
