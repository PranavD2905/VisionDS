import type { Entry, TestCase } from '@visionds/trace-schema';

/** How to launch the language's stepper; it prints the raw StepperOutput JSON. */
export interface StepperCommand {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface PreparedProgram {
  /** The stepper invocation (lldb-python for C++, JDI tracer for Java, …). */
  stepper: StepperCommand;
  /** Remove the temp working directory. */
  cleanup(): void;
}

export interface LanguageAdapter {
  language: string;
  /**
   * Compile student code + the (default or student-edited) system code/entry
   * against a testcase, and return how to step it.
   */
  prepare(studentCode: string, systemCode: string, entry: Entry, testCase: TestCase): PreparedProgram;
}

/**
 * A problem with the student's submission (compile error, no entry point, bad
 * input) — as opposed to an internal failure. The service turns this into an
 * `error` verdict trace rather than a 500.
 */
export class TraceUserError extends Error {}
