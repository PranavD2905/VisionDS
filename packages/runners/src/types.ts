import type { Entry, ExecutionTrace, TestCase } from '@visionds/trace-schema';

export interface RunnerCapabilities {
  language: string;
  runsIn: 'browser' | 'server';
}

export interface RunOptions {
  signal?: AbortSignal;
  /** Progress callback: 'loading' while the runtime boots, 'running' while tracing. */
  onStatus?: (status: 'loading' | 'running') => void;
}

/**
 * What actually gets executed: the student's own code, plus the generated
 * (and possibly student-edited) wiring — imports/call-site — that invokes it
 * against a testcase. `entry` names which function/method `systemCode`'s call
 * targets; absent when the runner should detect a default itself.
 */
export interface RunInput {
  studentCode: string;
  systemCode: string;
  entry?: Entry;
}

/**
 * The execution seam. PyodideRunner implements it in the browser today; a
 * server-side sandboxed runner for C++/Java plugs in behind the same
 * interface later.
 */
export interface Runner {
  capabilities: RunnerCapabilities;
  run(input: RunInput, testCase: TestCase, opts?: RunOptions): Promise<ExecutionTrace>;
}
