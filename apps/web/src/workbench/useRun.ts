import { saveRun } from '@visionds/auth';
import type { ExecutionTrace, TestCase } from '@visionds/trace-schema';
import { useState } from 'react';
import type { ImportProblem } from '../lib/import';
import { runnerFor } from '../runner';
import { useVis } from '../store';
import type { AuthClient } from './types';

interface RunInput {
  language: string;
  code: string;
  cases: TestCase[];
  problem: ImportProblem | null;
}

/**
 * Executing a run: picking the runner, walking the testcases, reporting
 * progress, persisting history, and putting the traces on stage.
 *
 * Kept out of the view so the workbench renders panes and nothing else — and
 * so the run flow can be reasoned about (and later, tested) on its own.
 */
export function useRun(client: AuthClient, signedIn: boolean) {
  const setTraces = useVis((s) => s.setTraces);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Best-effort history write — a failed save never blocks the animation. */
  const persist = (input: RunInput, traces: ExecutionTrace[]) => {
    if (!client || !signedIn) return;
    const shown = traces.find((t) => t.result.verdict !== 'pass') ?? traces[0];
    void saveRun(client, {
      language: input.language,
      code: input.code,
      testcases: input.cases,
      problem: input.problem,
      verdict: shown?.result.verdict ?? null,
    }).catch(() => {});
  };

  /** Show a set of traces, opening on the first failing case. */
  const show = (traces: ExecutionTrace[]) => {
    const failing = traces.findIndex((t) => t.result.verdict !== 'pass');
    setTraces(traces, failing === -1 ? 0 : failing);
  };

  const run = async (input: RunInput) => {
    setBusy(true);
    setError(null);
    try {
      const runner = runnerFor(input.language);
      const traces: ExecutionTrace[] = [];
      for (let i = 0; i < input.cases.length; i++) {
        setStatus(`Testcase ${i + 1} of ${input.cases.length}…`);
        traces.push(
          await runner.run(input.code, input.cases[i]!, {
            onStatus: (s) =>
              setStatus(
                s === 'loading'
                  ? runner.capabilities.runsIn === 'server'
                    ? 'Compiling & tracing on the server…'
                    : 'Loading Python runtime (first run only)…'
                  : `Running testcase ${i + 1} of ${input.cases.length}…`,
              ),
          }),
        );
      }
      persist(input, traces);
      show(traces);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return { busy, status, error, setError, run, show };
}
