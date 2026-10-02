/** One declared parameter of a candidate. */
export interface Param {
  name: string;
  /**
   * The declared value type, stripped of `const`, `&` and `*` (`vector<int>`,
   * `TreeNode`), or the full declared type in Java (`int[]`, `List<Integer>`).
   * Null where the language has no declared types (Python).
   */
  type: string | null;
  /** C++ only: a non-const reference — the target of an in-place solution. */
  mutableRef?: boolean;
}

/**
 * A function the submission could be run through directly: a top-level
 * function or a public method of `Solution`. See CONTEXT.md.
 */
export interface Candidate {
  name: string;
  /** `'Solution'` for a method, null for a top-level function. */
  className: string | null;
  params: Param[];
  /** Fewest arguments a call can pass (parameters without defaults). */
  minArgs: number;
  /** Most arguments a call can pass; null when it takes varargs. */
  maxArgs: number | null;
  /** Declared return type; null where undeclared (Python). */
  returnType: string | null;
  /** 1-based line of the function's name in the student's code. */
  line: number;
}

/** Everything the policy knows about one submission's code. */
export interface Analysis {
  /** Every candidate, in source order. */
  candidates: Candidate[];
  /**
   * Candidates no other function in the submission calls — the ones that can
   * only be reached from the call site. Falls back to every candidate when
   * all of them are called (mutual recursion).
   */
  roots: Candidate[];
  /** The entry point used when the student has not chosen one. */
  defaultEntry: Candidate;
}

/** Thrown for every policy failure; shared with the testcase parser. */
export { SubmissionError } from '@visionds/trace-schema';

/** The one entry-point rule set, implemented once per language. */
export interface EntryPolicy {
  language: string;
  /** Candidates, roots and the default entry. Throws SubmissionError. */
  analyze(code: string): Analysis;
  /** The call site that runs `entry` (the default entry when omitted). */
  defaultCallSite(code: string, entry?: Pick<Candidate, 'name' | 'className'>): string;
  /**
   * The one candidate `callSite` calls. With `argCount`, overloads are told
   * apart and an argument-count mismatch is reported. Throws SubmissionError.
   */
  resolveCallSite(code: string, callSite: string, argCount?: number): Candidate;
}
