import { WALL_CLOCK_MS, type ExecutionTrace, type TestCase } from '@visionds/trace-schema';
import type { Runner, RunOptions } from '../types';
import type { RunRequest, WorkerReply } from './messages';

/** Grace on top of the in-Python wall-clock cap before the worker is killed —
 * covers loops the tracer can never interrupt (C-level / tracer disabled). */
const WATCHDOG_MS = WALL_CLOCK_MS + 10_000;

export interface PyodideRunnerOptions {
  /** Base URL the Pyodide assets are served from. */
  indexURL?: string;
}

export class PyodideRunner implements Runner {
  readonly capabilities = { language: 'python', runsIn: 'browser' as const };

  private worker: Worker | null = null;
  private nextId = 1;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly indexURL: string;

  constructor(opts: PyodideRunnerOptions = {}) {
    this.indexURL = opts.indexURL ?? '/pyodide/';
  }

  run(code: string, testCase: TestCase, opts?: RunOptions): Promise<ExecutionTrace> {
    // One in-flight run at a time; later calls wait for earlier ones.
    const result = this.queue.then(() => this.runExclusive(code, testCase, opts));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private getWorker(): Worker {
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    });
    return this.worker;
  }

  private killWorker() {
    this.worker?.terminate();
    this.worker = null;
  }

  private runExclusive(
    code: string,
    testCase: TestCase,
    opts?: RunOptions,
  ): Promise<ExecutionTrace> {
    return new Promise<ExecutionTrace>((resolve, reject) => {
      const worker = this.getWorker();
      const id = this.nextId++;
      let watchdog: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        opts?.signal?.removeEventListener('abort', onAbort);
        if (watchdog !== undefined) clearTimeout(watchdog);
      };
      const armWatchdog = () => {
        if (watchdog !== undefined) clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          cleanup();
          this.killWorker();
          resolve({
            language: 'python',
            code,
            testCase,
            steps: [],
            truncated: true,
            result: {
              ...testCase,
              verdict: 'timeout',
              message: `execution did not finish within ${WATCHDOG_MS / 1000}s and was terminated`,
            },
          });
        }, WATCHDOG_MS);
      };
      const onAbort = () => {
        cleanup();
        this.killWorker();
        reject(new DOMException('run aborted', 'AbortError'));
      };
      const onError = (e: ErrorEvent) => {
        cleanup();
        this.killWorker();
        reject(new Error(e.message || 'worker crashed'));
      };
      const onMessage = (e: MessageEvent<WorkerReply>) => {
        const reply = e.data;
        if (reply.id !== id) return;
        if (reply.type === 'status') {
          // First run pays the Pyodide boot cost; don't count it against the
          // watchdog — start (or re-start) timing when execution begins.
          if (reply.status === 'running') armWatchdog();
          opts?.onStatus?.(reply.status);
          return;
        }
        cleanup();
        if (reply.type === 'result') resolve(reply.trace);
        else reject(new Error(reply.message));
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      opts?.signal?.addEventListener('abort', onAbort);
      const request: RunRequest = { id, code, testCase, indexURL: this.indexURL };
      worker.postMessage(request);
    });
  }
}
