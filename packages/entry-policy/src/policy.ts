import type { SyntaxNode } from '@lezer/common';
import { type Analysis, type Candidate, type EntryPolicy, SubmissionError } from './types';

/** A function body the call graph is built from — a candidate or a helper. */
export interface Unit {
  name: string;
  /** Names of every function this unit's body calls, nested bodies included. */
  calls: Set<string>;
}

/** One call expression found in a call site. */
export interface CallSiteCall {
  name: string;
  /** Called through a receiver (`Solution().f`, `obj.f`) rather than bare. */
  member: boolean;
}

/** What each language contributes; the rules in `makePolicy` are shared. */
export interface LanguageSyntax {
  language: string;
  /** Candidates and units in source order. Throws SubmissionError. */
  extract(code: string): { candidates: Candidate[]; units: Unit[] };
  /** Every call expression in a call site. */
  callSiteCalls(callSite: string): CallSiteCall[];
  /** Whether `call` can reach `candidate` (a bare call can't reach a method, …). */
  reaches(call: CallSiteCall, candidate: Candidate): boolean;
  /** The default call site for `entry`. */
  renderCallSite(entry: Candidate): string;
}

export function makePolicy(syntax: LanguageSyntax): EntryPolicy {
  const analyze = (code: string): Analysis => {
    const { candidates, units } = syntax.extract(code);
    if (candidates.length === 0) {
      throw new SubmissionError(noEntryMessage(syntax.language));
    }
    // A candidate is a helper of whichever other function calls it, so only
    // the uncalled ones are plausible entry points. Self-recursion is not a
    // caller: `fib` calling `fib` is still the root.
    const called = new Set<string>();
    for (const u of units) {
      for (const name of u.calls) if (name !== u.name) called.add(name);
    }
    const uncalled = candidates.filter((c) => !called.has(c.name));
    const roots = uncalled.length > 0 ? uncalled : candidates;
    const methods = roots.filter((c) => c.className !== null);
    const defaultEntry = (methods.length > 0 ? methods : roots).at(-1)!;
    return { candidates, roots, defaultEntry };
  };

  return {
    language: syntax.language,
    analyze,

    defaultCallSite(code, entry) {
      const analysis = analyze(code);
      const matches = entry
        ? analysis.candidates.filter(
            (c) => c.name === entry.name && c.className === entry.className,
          )
        : [];
      const target = matches.at(-1) ?? analysis.defaultEntry;
      return syntax.renderCallSite(target);
    },

    resolveCallSite(code, callSite, argCount) {
      const analysis = analyze(code);
      const { candidates } = analysis;

      // Every call in the call site that lands on one of the student's
      // candidates; calls to anything else (print, len, the Solution
      // constructor) are just part of the driver.
      const hits = syntax
        .callSiteCalls(callSite)
        .filter((call) => candidates.some((c) => syntax.reaches(call, c)));
      const names = [...new Set(hits.map((h) => h.name))];

      if (names.length === 0) {
        throw new SubmissionError(
          "The call site doesn't call any function from your code. " +
            `Pick an entry point, or call one of: ${analysis.roots.map(label).join(', ')}.`,
        );
      }
      if (names.length > 1) {
        throw new SubmissionError(
          `The call site calls more than one of your functions (${names.join(', ')}). ` +
            'Call exactly one — the others run as helpers from inside it.',
        );
      }
      const name = names[0]!;
      if (hits.length > 1) {
        throw new SubmissionError(
          `The call site calls ${name} ${hits.length} times. Call it once per run.`,
        );
      }

      const hit = hits[0]!;
      const overloads = candidates.filter((c) => c.name === name && syntax.reaches(hit, c));
      if (argCount === undefined) return overloads.at(-1)!;

      const fitting = overloads.filter(
        (c) => argCount >= c.minArgs && (c.maxArgs === null || argCount <= c.maxArgs),
      );
      if (fitting.length === 1) return fitting[0]!;
      if (fitting.length === 0) throw new SubmissionError(arityMessage(overloads, argCount));
      throw new SubmissionError(
        `${name} has ${fitting.length} overloads that take ${argCount} ` +
          `argument${argCount === 1 ? '' : 's'}, so the call is ambiguous. Rename one of them.`,
      );
    },
  };
}

/** `Solution.twoSum` or `helper` — how a candidate is named to students. */
export function label(c: Pick<Candidate, 'name' | 'className'>): string {
  return c.className ? `${c.className}.${c.name}` : c.name;
}

function arityMessage(overloads: Candidate[], argCount: number): string {
  const name = overloads[0]!.name;
  const counts = overloads.map(expectedArgs).join(' or ');
  const one = overloads.length === 1 && counts === '1';
  return (
    `${name} takes ${counts} argument${one ? '' : 's'}, but the testcase gives ${argCount}. ` +
    'Put one argument per line.'
  );
}

function expectedArgs(c: Candidate): string {
  if (c.maxArgs === null) return `at least ${c.minArgs}`;
  if (c.minArgs === c.maxArgs) return String(c.minArgs);
  return `${c.minArgs}–${c.maxArgs}`;
}

function noEntryMessage(language: string): string {
  switch (language) {
    case 'java':
      return 'No entry point found: add a public method to `class Solution`.';
    case 'cpp':
      return 'No entry point found: add a public method to `class Solution`, or a top-level function.';
    default:
      return 'No entry point found: define a top-level function or a method of `class Solution`.';
  }
}

// ------------------------------------------------------------ tree helpers

/** Maps source offsets to 1-based line numbers. */
export function lineIndex(code: string): (pos: number) => number {
  const starts = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

export function children(node: SyntaxNode): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
  return out;
}

/** Every descendant of `node` named `name`, in source order. */
export function descendants(node: SyntaxNode, name: string): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  const walk = (n: SyntaxNode) => {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.name === name) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}
