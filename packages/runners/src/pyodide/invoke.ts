// The Python policy alone: the worker bundle needs no C++/Java grammar.
import { pythonPolicy } from '@visionds/entry-policy/python';
import type { Candidate } from '@visionds/entry-policy';
import {
  ExecutionTraceSchema,
  MAX_COLLECTION_ITEMS,
  MAX_DEPTH,
  MAX_STEPS,
  MAX_STRING_LEN,
  SubmissionError,
  WALL_CLOCK_MS,
  parseTestCase,
  type ExecutionTrace,
  type JsonValue,
  type TestCase,
} from '@visionds/trace-schema';
import type { RunInput } from '../types';
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

interface Namespace {
  get(key: string): ((...args: unknown[]) => unknown) & { destroy(): void };
  destroy(): void;
}

function withHarness<T>(py: PyodideLike, fn: (ns: Namespace) => T): T {
  const ns = py.toPy({}) as Namespace;
  try {
    py.runPython(harnessSource, { globals: ns });
    return fn(ns);
  } finally {
    ns.destroy();
  }
}

/**
 * Runs one testcase through harness.py inside an existing Pyodide instance
 * and returns the schema-validated trace. Shared by the browser worker and
 * the Node test suite so both exercise identical code.
 *
 * The testcase is parsed and the entry point resolved from the call site
 * here, by the same shared rules every runner uses; the harness only traces.
 */
export function runCaseInPyodide(
  py: PyodideLike,
  input: RunInput,
  testCase: TestCase,
): ExecutionTrace {
  let args: JsonValue[] = [];
  let expected: JsonValue = null;
  let entry: Candidate | undefined;
  let submissionError = '';
  try {
    ({ args, expected } = parseTestCase(testCase));
    entry = pythonPolicy.resolveCallSite(input.studentCode, input.systemCode, args.length);
  } catch (e) {
    if (!(e instanceof SubmissionError)) throw e;
    submissionError = e.message;
  }

  return withHarness(py, (ns) => {
    const runCase = ns.get('run_case');
    try {
      const json = runCase(
        input.systemCode,
        input.studentCode,
        testCase.input,
        testCase.expected,
        JSON.stringify(args),
        JSON.stringify(expected),
        submissionError,
        CAPS_JSON,
      );
      const trace = JSON.parse(json as string) as ExecutionTrace;
      if (entry) trace.entry = { name: entry.name, className: entry.className };
      return ExecutionTraceSchema.parse(trace);
    } finally {
      runCase.destroy();
    }
  });
}
