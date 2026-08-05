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
 * The execution seam. PyodideRunner implements it in the browser today; a
 * server-side sandboxed runner for C++/Java plugs in behind the same
 * interface later.
 */
export interface Runner {
  capabilities: RunnerCapabilities;
  run(code: string, testCase: TestCase, opts?: RunOptions): Promise<ExecutionTrace>;
}
