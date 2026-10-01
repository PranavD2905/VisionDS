/**
 * Pane sizes, persisted per browser.
 *
 * Kept apart from the workbench draft (`draft.ts`): that is the student's
 * work, this is a viewing preference. Clearing one should never disturb the
 * other, and a corrupt layout must never cost someone their code.
 */
export interface WorkbenchLayout {
  /** Fraction of the split taken by the source pane. */
  split: number;
  /** Fraction of the source pane taken by the editor (testcases get the rest). */
  editorSplit: number;
  /** Whether the whole source panel is showing. Collapsed, the stage takes its room. */
  sourceOpen: boolean;
  /** Whether the testcases region is showing inside the source panel. */
  casesOpen: boolean;
}

export const DEFAULT_LAYOUT: WorkbenchLayout = {
  split: 0.46,
  editorSplit: 0.62,
  sourceOpen: true,
  casesOpen: true,
};

const KEY = 'visionds.workbench.layout.v1';

function clamp(v: unknown, lo: number, hi: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

export function readLayout(): WorkbenchLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const d = JSON.parse(raw) as Partial<WorkbenchLayout>;
    return {
      split: clamp(d.split, 0.2, 0.8, DEFAULT_LAYOUT.split),
      editorSplit: clamp(d.editorSplit, 0.2, 0.85, DEFAULT_LAYOUT.editorSplit),
      // only an explicit `false` collapses — a missing/garbage flag must never
      // hide a region the student never chose to hide (so a legacy `codeOpen`
      // flag, which only ever hid the editor, is ignored rather than migrated)
      sourceOpen: d.sourceOpen !== false,
      casesOpen: d.casesOpen !== false,
    };
  } catch {
    return DEFAULT_LAYOUT; // blocked storage or corrupt payload
  }
}

export function writeLayout(layout: WorkbenchLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* persistence is a convenience here */
  }
}
