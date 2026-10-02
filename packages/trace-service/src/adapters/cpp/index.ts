import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candidate } from '@visionds/entry-policy';
import { SubmissionError, type JsonValue } from '@visionds/trace-schema';
import { CAPS_JSON } from '../../caps';
import type { LanguageAdapter, PreparedProgram } from '../types';
import { assembleCppProgram } from './harness';

const COMPILER = process.env.VISIONDS_CXX ?? 'clang++';
const PYTHON = process.env.VISIONDS_PYTHON ?? '/usr/bin/python3';
const STEPPER = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'stepper', 'lldb_stepper.py');

let lldbPythonPath: string | null = null;
function getLldbPythonPath(): string {
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
  prepare(studentCode: string, callSite: string, entry: Candidate, args: JsonValue[]): PreparedProgram {
    const prog = assembleCppProgram(studentCode, callSite, entry, args);
    const dir = mkdtempSync(join(tmpdir(), 'visionds-cpp-'));
    const srcPath = join(dir, 'main.cpp');
    const binPath = join(dir, 'prog');
    writeFileSync(srcPath, prog.source, 'utf8');

    const compile = spawnSync(
      COMPILER,
      ['-g', '-O0', '-std=c++17', '-fno-omit-frame-pointer', '-o', binPath, srcPath],
      { encoding: 'utf8', timeout: 30_000 },
    );

    if (compile.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new SubmissionError(cleanCompilerError(compile.stderr ?? 'compilation failed', srcPath));
    }

    return {
      stepper: {
        command: PYTHON,
        args: [
          STEPPER,
          binPath,
          String(prog.studentStart),
          String(prog.studentEnd),
          entry.name,
          String(prog.studentStart + entry.line - 1),
          CAPS_JSON,
        ],
        env: { PYTHONPATH: getLldbPythonPath() },
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
