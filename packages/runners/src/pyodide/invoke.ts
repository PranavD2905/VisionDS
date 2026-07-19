import {
  ExecutionTraceSchema,
  MAX_COLLECTION_ITEMS,
  MAX_DEPTH,
  MAX_STEPS,
  MAX_STRING_LEN,
  WALL_CLOCK_MS,
  type ExecutionTrace,
  type TestCase,
} from '@visionds/trace-schema';
import harnessSource from './harness.py?raw';

const CAPS_JSON = JSON.stringify({
  MAX_STEPS,
  MAX_COLLECTION_ITEMS,
  MAX_STRING_LEN,
  MAX_DEPTH,
  WALL_CLOCK_MS,
});

/** Minimal slice of the Pyodide API we rely on, so this file has no hard
 * dependency on the pyodide package's types (the worker loads Pyodide from
 * static assets at run time). */
export interface PyodideLike {
  runPython(code: string, options?: { globals?: unknown }): unknown;
  toPy(value: unknown): unknown;
}

/**
 * Runs one testcase through harness.py inside an existing Pyodide instance
 * and returns the schema-validated trace. Shared by the browser worker and
 * the Node test suite so both exercise identical code.
 */
export function runCaseInPyodide(
  py: PyodideLike,
  code: string,
  testCase: TestCase,
): ExecutionTrace {
  const ns = py.toPy({}) as {
    get(key: string): ((...args: unknown[]) => unknown) & { destroy(): void };
    destroy(): void;
  };
  try {
    py.runPython(harnessSource, { globals: ns });
    const runCase = ns.get('run_case');
    try {
      const json = runCase(code, testCase.input, testCase.expected, CAPS_JSON);
      return ExecutionTraceSchema.parse(JSON.parse(json as string));
    } finally {
      runCase.destroy();
    }
  } finally {
    ns.destroy();
  }
}
