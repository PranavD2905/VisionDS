import {
  EntrySchema,
  ExecutionTraceSchema,
  type Entry,
  type ExecutionTrace,
  type TestCase,
} from '@visionds/trace-schema';
import type { Runner, RunInput, RunnerCapabilities, RunOptions } from '../types';

export interface ServerRunnerOptions {
  /** Base URL of the trace service, e.g. http://localhost:8787 */
  endpoint: string;
}

/**
 * Runs a testcase on the server-side trace service (compiled languages like
 * C++/Java that have no in-browser tracer). Speaks the same `Runner` contract
 * as PyodideRunner and returns a schema-validated ExecutionTrace, so the UI is
 * identical regardless of where execution happened.
 */
export class ServerRunner implements Runner {
  readonly capabilities: RunnerCapabilities;
  private readonly endpoint: string;

  constructor(language: string, opts: ServerRunnerOptions) {
    this.capabilities = { language, runsIn: 'server' };
    this.endpoint = opts.endpoint.replace(/\/$/, '');
  }

  async run(input: RunInput, testCase: TestCase, opts?: RunOptions): Promise<ExecutionTrace> {
    opts?.onStatus?.('loading');
    let res: Response;
    try {
      res = await fetch(`${this.endpoint}/trace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: this.capabilities.language,
          code: input.studentCode,
          systemCode: input.systemCode,
          entry: input.entry,
          testCase,
        }),
        signal: opts?.signal,
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      throw new Error(
        `Could not reach the ${this.capabilities.language} trace service at ${this.endpoint}. ` +
          `Start it with "pnpm --filter @visionds/trace-service dev".`,
      );
    }
    opts?.onStatus?.('running');

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Trace service error (${res.status}): ${detail.slice(0, 300)}`);
    }
    return ExecutionTraceSchema.parse(await res.json());
  }

  /**
   * Fetch the default system code (imports/decls/call-site) for the current
   * student code + testcase, optionally targeting a specific entry candidate
   * (e.g. a dropdown pick). Used by the UI to seed/regenerate the collapsed,
   * editable system-code strip without duplicating trace-service's
   * literal-generation logic into the browser bundle.
   */
  async fetchDefaultSystemCode(
    studentCode: string,
    entryOverride?: Entry,
  ): Promise<{ systemCode: string; entry: Entry }> {
    const res = await fetch(`${this.endpoint}/system-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: this.capabilities.language,
        code: studentCode,
        entryOverride,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Trace service error (${res.status}): ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as { systemCode: string; entry: unknown };
    return { systemCode: body.systemCode, entry: EntrySchema.parse(body.entry) };
  }
}
