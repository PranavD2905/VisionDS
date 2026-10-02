import type { TestCase } from '@visionds/trace-schema';
import { langById } from '../languages';
import type { CallSiteChoice, SourceState } from './source';

/**
 * The unsaved workbench draft, mirrored to localStorage.
 *
 * A refresh mid-problem used to drop the student back onto the two-sum
 * starter, losing whatever they had pasted or typed. This keeps the editor
 * where they left it. It is per-browser and never leaves the machine —
 * signed-in run history (`/history`) remains the durable, cross-device copy.
 *
 * The call-site choice is stored as such (auto / picked candidate / the
 * student's own text), so a refresh restores exactly what will run — a
 * picked entry no longer reverts to the default after a reload.
 */
export type WorkbenchDraft = SourceState;

const KEY = 'visionds.workbench.draft.v2';
/**
 * The previous format. Its code, testcases and problem carry over; its call
 * site does not — C++/Java call sites were then a whole `main()` with a
 * marker comment, which the current harness no longer accepts.
 */
const LEGACY_KEY = 'visionds.workbench.draft.v1';

function isTestCase(v: unknown): v is TestCase {
  const c = v as TestCase | null;
  return !!c && typeof c === 'object' && typeof c.input === 'string' && typeof c.expected === 'string';
}

/**
 * Restore the draft, or null when there is nothing usable to restore.
 *
 * Never throws: storage can be unavailable (private windows, blocked site
 * data) and the payload can be stale or hand-edited. Anything unrecognized is
 * treated as absent, so the workbench falls back to the language starter.
 */
export function readDraft(): WorkbenchDraft | null {
  let raw: string | null = null;
  let legacy = false;
  try {
    raw = localStorage.getItem(KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_KEY);
      legacy = raw !== null;
    }
  } catch {
    return null; // storage blocked — run without persistence
  }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<WorkbenchDraft> & { callSite?: unknown };
    if (typeof d.code !== 'string' || !d.code.trim()) return null;
    const cases = Array.isArray(d.cases) ? d.cases.filter(isTestCase) : [];
    if (cases.length === 0) return null;
    return {
      // an unknown id would silently reinterpret the code as another language
      language: langById(typeof d.language === 'string' ? d.language : '').id,
      code: d.code,
      cases,
      callSite: legacy ? { kind: 'auto' } : readCallSite(d.callSite),
      problem: d.problem && typeof d.problem === 'object' ? d.problem : null,
    };
  } catch {
    return null;
  }
}

/** A stored call-site choice, or `auto` for anything unrecognized. */
function readCallSite(v: unknown): CallSiteChoice {
  const c = v as Partial<{ kind: string; text: unknown; name: unknown; className: unknown }> | null;
  if (c?.kind === 'edited' && typeof c.text === 'string') return { kind: 'edited', text: c.text };
  if (
    c?.kind === 'picked' &&
    typeof c.name === 'string' &&
    (c.className === null || typeof c.className === 'string')
  ) {
    return { kind: 'picked', name: c.name, className: c.className };
  }
  return { kind: 'auto' };
}

export function writeDraft(draft: WorkbenchDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // quota exceeded or storage blocked — persistence is a convenience, not a
    // feature the workbench depends on
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nothing to do */
  }
}
