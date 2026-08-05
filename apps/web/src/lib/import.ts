// Handoff contract between the browser extension and the web app.
// The extension captures a student's LeetCode code + testcases and encodes
// them as a base64url payload in the URL hash: `/#import=<b64url(json)>`.
// Everything stays on the machine — nothing is sent to a server.

import type { TestCase } from '@visionds/trace-schema';

export const IMPORT_VERSION = 1;

export interface ImportProblem {
  title?: string;
  slug?: string;
  url?: string;
}

export interface ImportPayload {
  v: number;
  /** Language id matching `languages.ts` (python | cpp | java). */
  language: string;
  code: string;
  cases: TestCase[];
  problem?: ImportProblem;
}

/** Decode the UTF-8-safe base64url string the extension writes. */
function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Read an import payload out of the current URL hash, if present.
 * Returns null (never throws) when the hash is absent or malformed.
 */
export function readImportFromHash(hash: string = window.location.hash): ImportPayload | null {
  const m = /[#&]import=([A-Za-z0-9\-_]+)/.exec(hash);
  if (!m) return null;
  try {
    const payload = JSON.parse(b64urlDecode(m[1]!)) as ImportPayload;
    if (!payload || typeof payload.code !== 'string' || !Array.isArray(payload.cases)) {
      return null;
    }
    // Normalize cases to the strict { input, expected } shape.
    payload.cases = payload.cases
      .filter((c) => c && typeof c.input === 'string')
      .map((c) => ({ input: c.input, expected: typeof c.expected === 'string' ? c.expected : '' }));
    return payload;
  } catch {
    return null;
  }
}
