import type { ExecutionTrace, TestCase } from '@visionds/trace-schema';

export interface RunRequest {
  id: number;
  code: string;
  testCase: TestCase;
  /** Base URL Pyodide assets are served from, e.g. '/pyodide/'. */
  indexURL: string;
}

export type WorkerReply =
  | { id: number; type: 'status'; status: 'loading' | 'running' }
  | { id: number; type: 'result'; trace: ExecutionTrace }
  | { id: number; type: 'error'; message: string };
