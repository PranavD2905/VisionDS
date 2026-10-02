import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candidate } from '@visionds/entry-policy';
import { SubmissionError, type JsonValue } from '@visionds/trace-schema';
import { CAPS_JSON } from '../../caps';
import { run } from '../../proc';
import { childEnv, giveToSandbox, sandboxed } from '../../sandbox';
import type { LanguageAdapter, PreparedProgram } from '../types';
import { assembleCppProgram } from './harness';

const COMPILER = process.env.VISIONDS_CXX ?? 'clang++';
const PYTHON = process.env.VISIONDS_PYTHON ?? '/usr/bin/python3';
const STEPPER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'stepper', 'lldb_stepper.py');

// Address-space cap for clang and for lldb + the student binary it launches.
const MEM_MB = Number(process.env.VISIONDS_SANDBOX_MEM_MB) || 2048;

let lldbPythonPath: string | null = null;
function getLldbPythonPath(): string {
  // Debian/Ubuntu's `lldb -P` points at a dist-packages dir that does not
  // exist, so the container passes the real one in.
  lldbPythonPath ??= process.env.VISIONDS_LLDB_PYTHONPATH || null;
  if (lldbPythonPath === null) lldbPythonPath = execSync('lldb -P', { encoding: 'utf8' }).trim();
  return lldbPythonPath;
}

/**
 * C++ adapter: generates one translation unit (prelude + student code + a
 * testcase `main`), compiles it with debug info, and hands the binary to the
 * lldb stepper. Compilation problems become SubmissionError so they surface as a
 * clean `error` verdict instead of an exception.
 *
 * The stepper breaks on the resolved entry only — by name within the
 * student's lines, nearest the entry's own line — never on a same-named
 * library symbol.
 */
export const cppAdapter: LanguageAdapter = {
  language: 'cpp',
  async prepare(studentCode: string, callSite: string, entry: Candidate, args: JsonValue[]): Promise<PreparedProgram> {
    const prog = assembleCppProgram(studentCode, callSite, entry, args);
    const dir = mkdtempSync(join(tmpdir(), 'visionds-cpp-'));
    giveToSandbox(dir);
    const srcPath = join(dir, 'main.cpp');
    const binPath = join(dir, 'prog');
    writeFileSync(srcPath, prog.source, 'utf8');

    // The compiler sees student source too (`#include "/etc/…"`), so it runs
    // sandboxed like the program itself.
    const compile = await run(
      ...sandboxed(
        COMPILER,
        ['-g', '-O0', '-std=c++17', '-fno-omit-frame-pointer', '-o', binPath, srcPath],
        { memMb: MEM_MB },
      ),
      { timeoutMs: 30_000, env: childEnv({}, dir), cwd: dir },
    );
    if (compile.error) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`compiler failed to run: ${compile.error.message}`);
    }
    if (compile.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new SubmissionError(cleanCompilerError(compile.stderr ?? 'compilation failed', srcPath));
    }

    const [command, stepperArgs] = sandboxed(
      PYTHON,
      [
        STEPPER,
        binPath,
        String(prog.studentStart),
        String(prog.studentEnd),
        entry.name,
        String(prog.studentStart + entry.line - 1),
        CAPS_JSON,
      ],
      { memMb: MEM_MB },
    );
    return {
      stepper: {
        command,
        args: stepperArgs,
        env: {
          PYTHONPATH: getLldbPythonPath(),
          // The child env is scrubbed, so the image's debug-server path must be passed on.
          ...(process.env.LLDB_DEBUGSERVER_PATH ? { LLDB_DEBUGSERVER_PATH: process.env.LLDB_DEBUGSERVER_PATH } : {}),
        },
        cwd: dir,
      },
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  },
};

/** Strip the temp path and generated-line noise from compiler diagnostics. */
function cleanCompilerError(stderr: string, srcPath: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.replaceAll(srcPath, 'solution.cpp'))
    .filter((l) => l.trim() && !/^\d+ (errors?|warnings?) generated/.test(l));
  const firstError = lines.findIndex((l) => /error:/.test(l));
  const slice = firstError === -1 ? lines : lines.slice(firstError);
  return slice.slice(0, 8).join('\n') || 'compilation failed';
}
