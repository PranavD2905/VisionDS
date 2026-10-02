import { execFileSync } from 'node:child_process';
import { chownSync } from 'node:fs';

/**
 * Per-run sandboxing for student code (compile *and* step).
 *
 * Off unless `VISIONDS_SANDBOX_USER` names an unprivileged account — the
 * container image sets it; local macOS dev leaves it unset and runs as before.
 * When on, every child is launched as
 *
 *   prlimit <cpu/nproc/fsize/nofile[/as]> -- setpriv --reuid=U --regid=U --clear-groups -- <cmd>
 *
 * so it runs as that user under hard rlimits. Network is denied to the same
 * uid by an iptables owner-match rule the entrypoint installs (see
 * docker-entrypoint.sh); loopback stays open because JDI attaches to its
 * target JVM over a localhost socket.
 */
const USER = process.env.VISIONDS_SANDBOX_USER || '';

export const sandboxEnabled = (): boolean => USER !== '';

const num = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

export interface Limits {
  /** RLIMIT_AS in MB. Omit for the JVM: it reserves far more address space than it uses. */
  memMb?: number;
}

export function sandboxed(command: string, args: string[], limits: Limits = {}): [string, string[]] {
  if (!sandboxEnabled()) return [command, args];
  const rl = [
    `--cpu=${num('VISIONDS_SANDBOX_CPU_S', 20)}`,
    // Counts threads across *every* concurrent run of the uid; two JVMs per
    // Java trace use ~60, so leave headroom while still stopping a fork bomb.
    `--nproc=${num('VISIONDS_SANDBOX_NPROC', 512)}`,
    `--fsize=${num('VISIONDS_SANDBOX_FSIZE_MB', 16) * 1024 * 1024}`,
    `--nofile=${num('VISIONDS_SANDBOX_NOFILE', 256)}`,
  ];
  if (limits.memMb) rl.push(`--as=${limits.memMb * 1024 * 1024}`);
  return [
    'prlimit',
    [...rl, '--', 'setpriv', `--reuid=${USER}`, `--regid=${USER}`, '--clear-groups', '--', command, ...args],
  ];
}

let ids: { uid: number; gid: number } | null = null;

/** Hand a fresh temp dir to the sandbox user so the compiler/stepper can write in it. */
export function giveToSandbox(dir: string): void {
  if (!sandboxEnabled()) return;
  ids ??= {
    uid: Number(execFileSync('id', ['-u', USER], { encoding: 'utf8' }).trim()),
    gid: Number(execFileSync('id', ['-g', USER], { encoding: 'utf8' }).trim()),
  };
  chownSync(dir, ids.uid, ids.gid);
}

/**
 * The environment a child sees. Never the server's own `process.env`: that
 * would hand any secret the service is configured with to student code.
 */
export function childEnv(extra: Record<string, string> = {}, home = '/tmp'): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    LANG: 'C.UTF-8',
    HOME: home,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    ...extra,
  };
}
