import type { ExecutionTrace, TestCase } from '@visionds/trace-schema';
import type { RunInput } from '../types';

export interface RunRequest {
  id: number;
  input: RunInput;
  testCase: TestCase;
  /** Base URL Pyodide assets are served from, e.g. '/pyodide/'. */
  indexURL: string;
}

export type WorkerReply =
  | { id: number; type: 'status'; status: 'loading' | 'running' }
  | { id: number; type: 'result'; trace: ExecutionTrace }
  | { id: number; type: 'error'; message: string };
