import { spawn } from 'node:child_process';

export interface RunOptions {
  timeoutMs: number;
  maxBuffer?: number;
  env: Record<string, string>;
  cwd?: string;
}

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** The watchdog fired and the process group was killed. */
  timedOut: boolean;
  /** The process could not be started at all (missing binary, …). */
  error?: Error;
}

/**
 * Async `spawnSync` replacement. A trace takes seconds; running it
 * synchronously froze every other request (and `/health`) for that long.
 *
 * The child leads its own process group so the watchdog can kill the whole
 * tree — lldb *and* the student program it launched, the JDI tracer *and* its
 * target JVM — not just the direct child.
 */
export function run(command: string, args: string[], opts: RunOptions): Promise<RunResult> {
  const maxBuffer = opts.maxBuffer ?? 64 * 1024 * 1024;
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: opts.env,
      cwd: opts.cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outSize = 0;
    let errSize = 0;
    let timedOut = false;
    let settled = false;

    const killGroup = () => {
      if (child.pid === undefined) return;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, opts.timeoutMs);

    child.stdout.on('data', (b: Buffer) => {
      outSize += b.length;
      if (outSize > maxBuffer) return killGroup();
      out.push(b);
    });
    child.stderr.on('data', (b: Buffer) => {
      errSize += b.length;
      if (errSize <= maxBuffer) err.push(b);
    });

    const finish = (status: number | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Anything the child left behind in its group goes with it.
      killGroup();
      resolve({
        status,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
        error,
      });
    };
    child.on('error', (e) => finish(null, e));
    child.on('close', (code) => finish(code));
  });
}
