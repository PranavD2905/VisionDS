import type { ExecutionTrace, TestCase } from '@visionds/trace-schema';

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
 * What actually gets executed: the student's own code, plus the call site
 * (`systemCode`) that invokes it against a testcase. The call site is the
 * single source of truth for which function runs — every runner derives the
 * entry point from it (docs/adr/0001), so there is no separate `entry`.
 */
export interface RunInput {
  studentCode: string;
  systemCode: string;
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
