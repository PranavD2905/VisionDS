import type { TestCase } from '@visionds/trace-schema';
import { langById } from '../languages';
import type { ImportProblem } from '../lib/import';

/**
 * The unsaved workbench draft, mirrored to localStorage.
 *
 * A refresh mid-problem used to drop the student back onto the two-sum
 * starter, losing whatever they had pasted or typed. This keeps the editor
 * where they left it. It is per-browser and never leaves the machine —
 * signed-in run history (`/history`) remains the durable, cross-device copy.
 */
export interface WorkbenchDraft {
  language: string;
  code: string;
  cases: TestCase[];
  systemCode: string;
  /** Whether the student had taken ownership of the system-code strip. */
  systemCodeDirty: boolean;
  problem: ImportProblem | null;
}

const KEY = 'visionds.workbench.draft.v1';

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
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked — run without persistence
  }
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<WorkbenchDraft>;
    if (typeof d.code !== 'string' || !d.code.trim()) return null;
    const cases = Array.isArray(d.cases) ? d.cases.filter(isTestCase) : [];
    if (cases.length === 0) return null;
    return {
      // an unknown id would silently reinterpret the code as another language
      language: langById(typeof d.language === 'string' ? d.language : '').id,
      code: d.code,
      cases,
      systemCode: typeof d.systemCode === 'string' ? d.systemCode : '',
      systemCodeDirty: d.systemCodeDirty === true,
      problem: d.problem && typeof d.problem === 'object' ? d.problem : null,
    };
  } catch {
    return null;
  }
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
  } catch {
    /* nothing to do */
  }
}
