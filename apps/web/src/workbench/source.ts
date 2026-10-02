import { label, policyFor } from '@visionds/entry-policy';
import { SubmissionError, type Entry, type TestCase } from '@visionds/trace-schema';
import { langById } from '../languages';
import type { ImportProblem } from '../lib/import';

/**
 * How the call site is chosen. The call site *text* is what runs and what
 * decides the entry point (docs/adr/0001); this records where that text comes
 * from, so it can be regenerated as the code changes without ever reverting a
 * choice the student made.
 *
 * - `auto`: the default entry's call site, following every code edit.
 * - `picked`: the call site for a candidate chosen in the picker, also
 *   regenerated on code edits (so renaming a parameter keeps it valid), and
 *   lapsing back to the default only if that candidate disappears.
 * - `edited`: the student's own text, never touched by code edits.
 */
export type CallSiteChoice =
  | { kind: 'auto' }
  | { kind: 'picked'; name: string; className: string | null }
  | { kind: 'edited'; text: string };

/** Everything the student is editing — the workbench's source of truth. */
export interface SourceState {
  language: string;
  code: string;
  cases: TestCase[];
  callSite: CallSiteChoice;
  problem: ImportProblem | null;
}

export type SourceAction =
  | { type: 'load'; language: string; code: string; cases: TestCase[]; problem: ImportProblem | null }
  | { type: 'editCode'; code: string }
  | { type: 'editCases'; update: (cases: TestCase[]) => TestCase[] }
  | { type: 'editCallSite'; text: string }
  | { type: 'pickEntry'; entry: Entry }
  | { type: 'resetCallSite' };

/**
 * Pure state transitions. Nothing here fetches or waits: every derived fact
 * (call site text, entry, candidates) is computed by `deriveSource`, so there
 * is no response to race and no flag to keep consistent with another.
 */
export function sourceReducer(state: SourceState, action: SourceAction): SourceState {
  switch (action.type) {
    case 'load': {
      const def = langById(action.language);
      return {
        language: def.id,
        code: action.code || def.starterCode,
        cases: action.cases.length ? action.cases : def.starterCases,
        callSite: { kind: 'auto' },
        problem: action.problem,
      };
    }
    case 'editCode':
      return { ...state, code: action.code };
    case 'editCases':
      return { ...state, cases: action.update(state.cases) };
    case 'editCallSite':
      return { ...state, callSite: { kind: 'edited', text: action.text } };
    case 'pickEntry':
      return {
        ...state,
        callSite: { kind: 'picked', name: action.entry.name, className: action.entry.className },
      };
    case 'resetCallSite':
      return { ...state, callSite: { kind: 'auto' } };
  }
}

/** What the source pane shows and what Run sends, derived from the state. */
export interface SourceView {
  /** The call site text that runs. */
  callSite: string;
  /** The entry that text resolves to, or null when it resolves to none. */
  entry: Entry | null;
  /** The picker's options: the roots, plus the current entry if it isn't one. */
  candidates: Entry[];
  /** More than one way to run the file — a choice worth offering. */
  showPicker: boolean;
  /** Why the submission can't run as it stands (a SubmissionError), if it can't. */
  problem: string | null;
}

const entryOf = (c: Entry): Entry => ({ name: c.name, className: c.className });
const same = (a: Entry, b: Entry) => a.name === b.name && a.className === b.className;

export function deriveSource(state: Pick<SourceState, 'language' | 'code' | 'callSite'>): SourceView {
  const edited = state.callSite.kind === 'edited' ? state.callSite.text : null;
  const policy = policyFor(state.language);
  if (!policy) {
    return { callSite: edited ?? '', entry: null, candidates: [], showPicker: false, problem: null };
  }

  let analysis;
  try {
    analysis = policy.analyze(state.code);
  } catch (e) {
    if (!(e instanceof SubmissionError)) throw e;
    return { callSite: edited ?? '', entry: null, candidates: [], showPicker: false, problem: e.message };
  }

  const choice = state.callSite;
  const pick =
    choice.kind === 'picked' ? analysis.candidates.find((c) => same(c, choice)) : undefined;
  const callSite = edited ?? policy.defaultCallSite(state.code, pick);

  let entry: Entry | null = null;
  let problem: string | null = null;
  try {
    entry = entryOf(policy.resolveCallSite(state.code, callSite));
  } catch (e) {
    if (!(e instanceof SubmissionError)) throw e;
    problem = e.message;
  }

  const roots = analysis.roots.map(entryOf);
  const candidates = entry && !roots.some((r) => same(r, entry)) ? [...roots, entry] : roots;
  return { callSite, entry, candidates, showPicker: candidates.length >= 2, problem };
}

/** `Solution.twoSum` / `helper` — the picker's option label. */
export const entryLabel = (e: Entry) => label(e);
