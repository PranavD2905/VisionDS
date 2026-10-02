import type { Candidate } from '@visionds/entry-policy';
import type { JsonValue } from '@visionds/trace-schema';

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
   * Compile the student's code with the call site and this testcase's parsed
   * arguments, and return how to step it. `entry` is the candidate the call
   * site was resolved to — it types the argument declarations and tells the
   * stepper where to start. A compile error throws SubmissionError.
   */
  prepare(studentCode: string, callSite: string, entry: Candidate, args: JsonValue[]): PreparedProgram;
}
