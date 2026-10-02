import { type Candidate, policyFor } from '@visionds/entry-policy';
import {
  ExecutionTraceSchema,
  MAX_STEPS,
  SubmissionError,
  WALL_CLOCK_MS,
  parseTestCase,
  userErrorTrace,
  type Entry,
  type ExecutionTrace,
  type JsonValue,
  type TestCase,
  type TraceStep,
} from '@visionds/trace-schema';
import { cppAdapter } from './adapters/cpp';
import { javaAdapter } from './adapters/java';
import type { LanguageAdapter, PreparedProgram } from './adapters/types';
import { run } from './proc';
import { childEnv } from './sandbox';
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
 * Trace one testcase for a server-side language and return a schema-validated
 * ExecutionTrace — the exact contract the Pyodide runner produces, so the UI
 * treats every language identically.
 *
 * `systemCode` is the call site. It alone decides which function runs: the
 * entry point is resolved from it by the shared policy (docs/adr/0001), and
 * an absent or blank call site means the default one. Every problem with the
 * submission — no entry point, a call site calling zero or several of the
 * student's functions, an unparseable testcase, an argument-count mismatch, a
 * compile error — comes back as an `error` verdict, never a throw.
 */
export async function traceCase(
  language: string,
  code: string,
  testCase: TestCase,
  systemCode?: string,
): Promise<ExecutionTrace> {
  const adapter = ADAPTERS[language.toLowerCase()];
  const policy = policyFor(language);
  if (!adapter || !policy) {
    return userErrorTrace({ language, code, testCase, message: `unsupported language: ${language}` });
  }

  let callSite = systemCode ?? '';
  let entry: Candidate;
  let args: JsonValue[];
  let expected: JsonValue;
  try {
    if (!callSite.trim()) callSite = policy.defaultCallSite(code);
    ({ args, expected } = parseTestCase(testCase));
    entry = policy.resolveCallSite(code, callSite, args.length);
  } catch (e) {
    if (!(e instanceof SubmissionError)) throw e;
    return userErrorTrace({ language, code, testCase, message: e.message, systemCode: callSite });
  }

  const traced: Entry = { name: entry.name, className: entry.className };
  let prepared: PreparedProgram;
  try {
    prepared = await adapter.prepare(code, callSite, entry, args);
  } catch (e) {
    if (!(e instanceof SubmissionError)) throw e;
    return userErrorTrace({
      language,
      code,
      testCase,
      message: e.message,
      systemCode: callSite,
      entry: traced,
    });
  }

  try {
    const out = await runStepper(prepared);
    return assembleTrace(language, code, testCase, out, callSite, traced, expected);
  } finally {
    prepared.cleanup();
  }
}

async function runStepper(p: PreparedProgram): Promise<StepperOutput> {
  const res = await run(p.stepper.command, p.stepper.args, {
    timeoutMs: WALL_CLOCK_MS + 15_000, // watchdog above the in-stepper wall clock
    maxBuffer: 64 * 1024 * 1024,
    env: childEnv(p.stepper.env, p.stepper.cwd),
    cwd: p.stepper.cwd,
  });
  if (res.error) throw new Error(`stepper failed to run: ${res.error.message}`);
  if (res.timedOut) throw new Error('stepper exceeded its watchdog and was killed');
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
  expected: JsonValue,
): ExecutionTrace {
  const steps: TraceStep[] = [...out.steps];

  const hasResult = out.resultJson !== null && out.resultJson !== undefined;
  const actual: JsonValue | undefined = hasResult
    ? (JSON.parse(out.resultJson as string) as JsonValue)
    : undefined;

  // Synthesize a `return` step so the UI shows the "returns X" moment and has a
  // step to jump to — the stepper only emits per-line events. It is the
  // *entry* returning at depth 0, even when the last recorded line was inside
  // a helper; naming it after that helper made the call tree close the entry
  // and open a bogus second root.
  if (hasResult && out.exited && steps.length > 0) {
    const last = steps[steps.length - 1]!;
    // The entry's own last moment — its line and locals, not a helper's.
    let entryLast = last;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i]!.callDepth === 0) {
        entryLast = steps[i]!;
        break;
      }
    }
    steps.push({
      index: steps.length,
      line: entryLast.line,
      event: 'return',
      locals: entryLast.locals,
      func: entry.name,
      ...(entryLast.frameId !== undefined ? { frameId: entryLast.frameId } : {}),
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
    result: buildResult(testCase, steps, out, actual, hasResult, expected),
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
  expected: JsonValue,
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
