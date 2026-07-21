import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestCase } from '@visionds/trace-schema';
import { type LanguageAdapter, type PreparedProgram, TraceUserError } from '../types';
import { generateCppProgram } from './harness';

const COMPILER = process.env.VISIONDS_CXX ?? 'clang++';

/**
 * C++ adapter: generates one translation unit (prelude + student code + a
 * testcase `main`), compiles it with debug info, and hands the binary to the
 * lldb stepper. Compilation problems become TraceUserError so they surface as a
 * clean `error` verdict instead of an exception.
 */
export const cppAdapter: LanguageAdapter = {
  language: 'cpp',
  prepare(code: string, testCase: TestCase): PreparedProgram {
    const prog = generateCppProgram(code, testCase);
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
      throw new TraceUserError(cleanCompilerError(compile.stderr ?? 'compilation failed', srcPath));
    }

    return {
      binary: binPath,
      entry: prog.entry,
      studentStart: prog.studentStart,
      studentEnd: prog.studentEnd,
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
