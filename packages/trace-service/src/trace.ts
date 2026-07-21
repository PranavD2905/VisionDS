import { execSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ExecutionTraceSchema,
  MAX_COLLECTION_ITEMS,
  MAX_DEPTH,
  MAX_STEPS,
  MAX_STRING_LEN,
  WALL_CLOCK_MS,
  type ExecutionTrace,
  type JsonValue,
  type TestCase,
  type TraceStep,
} from '@visionds/trace-schema';
import { cppAdapter } from './adapters/cpp';
import { type LanguageAdapter, TraceUserError } from './adapters/types';
import { parseValue } from './parseInput';
import { valuesEqual } from './verdict';

const ADAPTERS: Record<string, LanguageAdapter> = {
  cpp: cppAdapter,
  'c++': cppAdapter,
};

const CAPS_JSON = JSON.stringify({
  MAX_STEPS,
  MAX_COLLECTION_ITEMS,
  MAX_STRING_LEN,
  MAX_DEPTH,
  WALL_CLOCK_MS,
});

const STEPPER = join(dirname(fileURLToPath(import.meta.url)), 'stepper', 'lldb_stepper.py');
const PYTHON = process.env.VISIONDS_PYTHON ?? '/usr/bin/python3';

let lldbPythonPath: string | null = null;
function getLldbPythonPath(): string {
  if (lldbPythonPath === null) {
    lldbPythonPath = execSync('lldb -P', { encoding: 'utf8' }).trim();
  }
  return lldbPythonPath;
}

interface StepperOutput {
  steps: TraceStep[];
  limit: 'steps' | 'time' | null;
  resultJson: string | null;
  exited: boolean;
  error?: string;
}

export function supportedLanguages(): string[] {
  return ['cpp'];
}

/**
 * Trace one testcase for a server-side language and return a schema-validated
 * ExecutionTrace — the exact contract the Pyodide runner produces, so the UI
 * treats every language identically.
 */
export function traceCase(language: string, code: string, testCase: TestCase): ExecutionTrace {
  const adapter = ADAPTERS[language.toLowerCase()];
  if (!adapter) {
    return errorTrace(language, code, testCase, `unsupported language: ${language}`);
  }

  let prepared;
  try {
    prepared = adapter.prepare(code, testCase);
  } catch (e) {
    if (e instanceof TraceUserError) return errorTrace(language, code, testCase, e.message);
    throw e;
  }

  try {
    const out = runStepper(prepared.binary, prepared);
    return assembleTrace(language, code, testCase, out);
  } finally {
    prepared.cleanup();
  }
}

function runStepper(
  binary: string,
  p: { entry: string; studentStart: number; studentEnd: number },
): StepperOutput {
  const res = spawnSync(
    PYTHON,
    [STEPPER, binary, String(p.studentStart), String(p.studentEnd), p.entry, CAPS_JSON],
    {
      encoding: 'utf8',
      timeout: WALL_CLOCK_MS + 10_000, // watchdog above the in-stepper wall clock
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PYTHONPATH: getLldbPythonPath() },
    },
  );
  if (res.error) throw new Error(`stepper failed to run: ${res.error.message}`);
  const stdout = (res.stdout ?? '').trim();
  if (!stdout) throw new Error(`stepper produced no output. stderr: ${res.stderr ?? ''}`);
  const parsed = JSON.parse(stdout) as StepperOutput;
  if (parsed.error) throw new Error(`stepper error: ${parsed.error}`);
  return parsed;
}

function assembleTrace(
  language: string,
  code: string,
  testCase: TestCase,
  out: StepperOutput,
): ExecutionTrace {
  const steps: TraceStep[] = [...out.steps];

  const hasResult = out.resultJson !== null && out.resultJson !== undefined;
  const actual: JsonValue | undefined = hasResult
    ? (JSON.parse(out.resultJson as string) as JsonValue)
    : undefined;

  // Synthesize a `return` step so the UI shows the "returns X" moment and has a
  // step to jump to — the stepper only emits per-line events.
  if (hasResult && out.exited && steps.length > 0) {
    const last = steps[steps.length - 1]!;
    steps.push({
      index: steps.length,
      line: last.line,
      event: 'return',
      locals: last.locals,
      stdout: last.stdout,
      callDepth: 0,
      returnValue: actual ?? null,
    });
  }

  const trace: ExecutionTrace = {
    language,
    code,
    testCase,
    steps,
    result: buildResult(testCase, steps, out, actual, hasResult),
  };
  if (out.limit) trace.truncated = true;
  return ExecutionTraceSchema.parse(trace);
}

function buildResult(
  testCase: TestCase,
  steps: TraceStep[],
  out: StepperOutput,
  actual: JsonValue | undefined,
  hasResult: boolean,
) {
  const lastIndex = steps.length > 0 ? steps.length - 1 : undefined;

  if (out.limit) {
    return {
      ...testCase,
      verdict: 'timeout' as const,
      message:
        out.limit === 'steps'
          ? `step limit (${MAX_STEPS} steps) exceeded`
          : `time limit (${WALL_CLOCK_MS} ms) exceeded`,
      ...(lastIndex !== undefined ? { divergenceStepIndex: lastIndex } : {}),
    };
  }

  if (!hasResult || !out.exited) {
    return {
      ...testCase,
      verdict: 'error' as const,
      message: 'the program crashed or did not return a value before exiting',
      ...(lastIndex !== undefined ? { divergenceStepIndex: lastIndex } : {}),
    };
  }

  const expected = parseValue(testCase.expected);
  if (valuesEqual(actual as JsonValue, expected)) {
    return { ...testCase, verdict: 'pass' as const, actual };
  }
  return {
    ...testCase,
    verdict: 'fail' as const,
    actual,
    ...(lastIndex !== undefined ? { divergenceStepIndex: lastIndex } : {}),
  };
}

function errorTrace(
  language: string,
  code: string,
  testCase: TestCase,
  message: string,
): ExecutionTrace {
  return ExecutionTraceSchema.parse({
    language,
    code,
    testCase,
    steps: [],
    result: { ...testCase, verdict: 'error', message },
  });
}
