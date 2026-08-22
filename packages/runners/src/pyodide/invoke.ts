import {
  ExecutionTraceSchema,
  MAX_COLLECTION_ITEMS,
  MAX_DEPTH,
  MAX_STEPS,
  MAX_STRING_LEN,
  WALL_CLOCK_MS,
  type Entry,
  type ExecutionTrace,
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

/** Every plausible entry candidate in `code`, via the real AST-based detector. */
export function listPythonEntryCandidates(py: PyodideLike, code: string): Entry[] {
  return withHarness(py, (ns) => {
    const listCandidates = ns.get('list_entry_candidates');
    try {
      return JSON.parse(listCandidates(code) as string) as Entry[];
    } finally {
      listCandidates.destroy();
    }
  });
}

/** The default, student-visible/editable call-site for `code`. */
export function getDefaultPythonSystemCode(
  py: PyodideLike,
  code: string,
  entryOverride?: Entry,
): { systemCode: string; entry: Entry } {
  const candidates = listPythonEntryCandidates(py, code);
  if (candidates.length === 0) {
    throw new Error('no entry point found: define a top-level function or a Solution class');
  }
  const entry =
    (entryOverride && candidates.find((c) => c.name === entryOverride.name)) ??
    candidates[candidates.length - 1]!;
  return withHarness(py, (ns) => {
    const defaultSystemCode = ns.get('default_system_code');
    try {
      // Pass '' rather than JS `null` — crossing the Pyodide FFI as a bare
      // argument, `null` doesn't reliably become Python `None`.
      const systemCode = defaultSystemCode(entry.name, entry.className ?? '') as string;
      return { systemCode, entry };
    } finally {
      defaultSystemCode.destroy();
    }
  });
}

/**
 * Runs one testcase through harness.py inside an existing Pyodide instance
 * and returns the schema-validated trace. Shared by the browser worker and
 * the Node test suite so both exercise identical code.
 */
export function runCaseInPyodide(
  py: PyodideLike,
  input: RunInput,
  testCase: TestCase,
): ExecutionTrace {
  return withHarness(py, (ns) => {
    const runCase = ns.get('run_case');
    try {
      const json = runCase(
        input.systemCode,
        input.studentCode,
        testCase.input,
        testCase.expected,
        CAPS_JSON,
      );
      return ExecutionTraceSchema.parse(JSON.parse(json as string));
    } finally {
      runCase.destroy();
    }
  });
}
