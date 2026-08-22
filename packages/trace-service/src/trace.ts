import { spawnSync } from 'node:child_process';
import {
  ExecutionTraceSchema,
  MAX_STEPS,
  WALL_CLOCK_MS,
  listJavaEntryCandidates,
  type Entry,
  type ExecutionTrace,
  type JsonValue,
  type TestCase,
  type TraceStep,
} from '@visionds/trace-schema';
import { cppAdapter } from './adapters/cpp';
import { generateDefaultSystemCode as generateDefaultCppSystemCode } from './adapters/cpp/harness';
import { javaAdapter } from './adapters/java';
import { generateDefaultJavaSystemCode } from './adapters/java/harness';
import { type LanguageAdapter, type PreparedProgram, TraceUserError } from './adapters/types';
import { parseValue } from './parseInput';
import { valuesEqual } from './verdict';

const ADAPTERS: Record<string, LanguageAdapter> = {
  cpp: cppAdapter,
  'c++': cppAdapter,
  java: javaAdapter,
};

interface StepperOutput {
  steps: TraceStep[];
  limit: 'steps' | 'time' | null;
  resultJson: string | null;
  exited: boolean;
  error?: string;
}

export function supportedLanguages(): string[] {
  return ['cpp', 'java'];
}

/**
 * The default system code (imports/decls/call-site) for a language + student
 * code + testcase — what the UI seeds its collapsed, editable strip with, and
 * what a dropdown pick of a non-default candidate regenerates against.
 */
export function getDefaultSystemCode(
  language: string,
  code: string,
  entryOverride?: Entry,
): { systemCode: string; entry: Entry } {
  const lang = language.toLowerCase();
  if (lang === 'cpp' || lang === 'c++') {
    // CppEntry is exactly {name, className} — the wire-level Entry shape
    // already matches, no lookup needed.
    return generateDefaultCppSystemCode(code, entryOverride ?? undefined);
  }
  if (lang === 'java') {
    // JavaEntry carries returnType/params too (needed to build typed decls);
    // resolve the wire-level {name, className} pick against the current
    // code's candidate list to recover the full signature.
    const resolved = entryOverride
      ? listJavaEntryCandidates(code).find((c) => c.name === entryOverride.name)
      : undefined;
    const seed = generateDefaultJavaSystemCode(code, resolved);
    return { systemCode: seed.systemCode, entry: { name: seed.entry.name, className: 'Solution' } };
  }
  throw new TraceUserError(`unsupported language: ${language}`);
}

/**
 * Trace one testcase for a server-side language and return a schema-validated
 * ExecutionTrace — the exact contract the Pyodide runner produces, so the UI
 * treats every language identically.
 */
export function traceCase(
  language: string,
  code: string,
  testCase: TestCase,
  systemCode?: string,
  entry?: Entry,
): ExecutionTrace {
  const adapter = ADAPTERS[language.toLowerCase()];
  if (!adapter) {
    return errorTrace(language, code, testCase, `unsupported language: ${language}`);
  }

  // An empty string or a nameless entry means "not really provided" (e.g. the
  // client hasn't finished generating its default yet) — never let that
  // silently produce a system-code region with no call in it, which would
  // compile to a translation unit with no `main()` and fail at *link* time
  // with a confusing "undefined symbol: _main" instead of a clean error.
  const haveSystemCode = systemCode !== undefined && systemCode.trim() !== '';
  const haveEntry = entry !== undefined && entry.name !== '';

  let resolvedSystemCode: string;
  let resolvedEntry: Entry;
  try {
    if (haveSystemCode && haveEntry) {
      resolvedSystemCode = systemCode!;
      resolvedEntry = entry!;
    } else {
      const seed = getDefaultSystemCode(language, code, haveEntry ? entry : undefined);
      resolvedSystemCode = haveSystemCode ? systemCode! : seed.systemCode;
      resolvedEntry = haveEntry ? entry! : seed.entry;
    }
  } catch (e) {
    if (e instanceof TraceUserError) return errorTrace(language, code, testCase, e.message);
    throw e;
  }

  let prepared;
  try {
    prepared = adapter.prepare(code, resolvedSystemCode, resolvedEntry, testCase);
  } catch (e) {
    if (e instanceof TraceUserError) return errorTrace(language, code, testCase, e.message);
    throw e;
  }

  try {
    const out = runStepper(prepared);
    return assembleTrace(language, code, testCase, out, resolvedSystemCode, resolvedEntry);
  } finally {
    prepared.cleanup();
  }
}

function runStepper(p: PreparedProgram): StepperOutput {
  const res = spawnSync(p.stepper.command, p.stepper.args, {
    encoding: 'utf8',
    timeout: WALL_CLOCK_MS + 15_000, // watchdog above the in-stepper wall clock
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...p.stepper.env },
  });
  if (res.error) throw new Error(`stepper failed to run: ${res.error.message}`);
  const stdout = (res.stdout ?? '').trim();
  if (!stdout) throw new Error(`stepper produced no output. stderr: ${res.stderr ?? ''}`);
  // The stepper prints one JSON object; ignore any leading debugger chatter.
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) throw new Error(`stepper output was not JSON: ${stdout.slice(0, 300)}`);
  const parsed = JSON.parse(stdout.slice(jsonStart)) as StepperOutput;
  if (parsed.error) throw new Error(`stepper error: ${parsed.error}`);
  // The Java tracer emits index:0 for every step; normalize to array position.
  parsed.steps.forEach((s, i) => (s.index = i));
  return parsed;
}

function assembleTrace(
  language: string,
  code: string,
  testCase: TestCase,
  out: StepperOutput,
  systemCode: string,
  entry: Entry,
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
      func: last.func,
      stdout: last.stdout,
      callDepth: 0,
      returnValue: actual ?? null,
    });
  }

  const trace: ExecutionTrace = {
    language,
    code,
    systemCode,
    entry,
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
