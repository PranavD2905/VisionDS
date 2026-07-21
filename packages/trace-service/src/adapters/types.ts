import type { TestCase } from '@visionds/trace-schema';

export interface PreparedProgram {
  /** Path to the compiled, debuggable executable. */
  binary: string;
  /** Symbol the stepper breaks on and the harness calls. */
  entry: string;
  /** 1-based line range of the student's code inside the generated source. */
  studentStart: number;
  studentEnd: number;
  /** Remove the temp working directory. */
  cleanup(): void;
}

export interface LanguageAdapter {
  language: string;
  /** Compile student code + a testcase harness into a debuggable binary. */
  prepare(code: string, testCase: TestCase): PreparedProgram;
}

/**
 * A problem with the student's submission (compile error, no entry point, bad
 * input) — as opposed to an internal failure. The service turns this into an
 * `error` verdict trace rather than a 500.
 */
export class TraceUserError extends Error {}
