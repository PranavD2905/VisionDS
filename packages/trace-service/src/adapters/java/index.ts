import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Candidate } from '@visionds/entry-policy';
import { SubmissionError, type JsonValue } from '@visionds/trace-schema';
import { CAPS_JSON } from '../../caps';
import { run } from '../../proc';
import { childEnv, giveToSandbox, sandboxed } from '../../sandbox';
import type { LanguageAdapter, PreparedProgram } from '../types';
import { assembleJavaProgram } from './harness';

const TRACER_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'stepper', 'VisionDsTracer.java');

let javaHome: string | null = null;
function resolveJavaHome(): string {
  if (javaHome) return javaHome;
  if (process.env.VISIONDS_JAVA_HOME && existsSync(process.env.VISIONDS_JAVA_HOME)) {
    return (javaHome = process.env.VISIONDS_JAVA_HOME);
  }
  const candidates = [
    '/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
    '/usr/local/opt/openjdk/libexec/openjdk.jdk/Contents/Home',
  ];
  for (const c of candidates) if (existsSync(join(c, 'bin', 'javac'))) return (javaHome = c);
  try {
    const h = execSync('/usr/libexec/java_home', { encoding: 'utf8' }).trim();
    if (h && existsSync(join(h, 'bin', 'javac'))) return (javaHome = h);
  } catch {
    /* no registered JDK */
  }
  throw new Error(
    'No JDK found. Install one (e.g. `brew install openjdk`) or set VISIONDS_JAVA_HOME.',
  );
}

const bin = (tool: string) => join(resolveJavaHome(), 'bin', tool);

// The JDI tracer is fixed per build; compile it once into a cache dir keyed by
// its source, so an edited tracer is never run from a stale cached class. In
// the container the cache lives in a root-owned VISIONDS_CACHE_DIR: under a
// world-writable /tmp the sandbox user could plant a class at the predictable
// path before the server compiled it.
let tracerClasses: string | null = null;
export function ensureTracerCompiled(): string {
  if (tracerClasses && existsSync(join(tracerClasses, 'VisionDsTracer.class'))) return tracerClasses;
  const hash = createHash('sha256').update(readFileSync(TRACER_SRC)).digest('hex').slice(0, 12);
  const dir = join(process.env.VISIONDS_CACHE_DIR || tmpdir(), `visionds-java-tracer-${hash}`);
  if (existsSync(join(dir, 'VisionDsTracer.class'))) return (tracerClasses = dir);
  mkdirSync(dir, { recursive: true });
  const res = spawnSync(bin('javac'), ['-d', dir, TRACER_SRC], { encoding: 'utf8', timeout: 60_000 });
  if (res.status !== 0) throw new Error(`failed to compile JDI tracer: ${res.stderr ?? ''}`);
  return (tracerClasses = dir);
}

/**
 * Java adapter: writes Solution.java + Main.java, compiles them with debug info,
 * and steps Main under the JDI tracer. Compile errors become SubmissionError so
 * they surface as an `error` verdict.
 */
export const javaAdapter: LanguageAdapter = {
  language: 'java',
  async prepare(studentCode: string, callSite: string, entry: Candidate, args: JsonValue[]): Promise<PreparedProgram> {
    const prog = assembleJavaProgram(studentCode, callSite, entry, args);
    const tracer = ensureTracerCompiled();

    const dir = mkdtempSync(join(tmpdir(), 'visionds-java-'));
    giveToSandbox(dir);
    const solPath = join(dir, 'Solution.java');
    const mainPath = join(dir, 'Main.java');
    writeFileSync(solPath, prog.solution, 'utf8');
    writeFileSync(mainPath, prog.main, 'utf8');

    const compile = await run(...sandboxed(bin('javac'), ['-J-Xmx256m', '-g', '-d', dir, solPath, mainPath]), {
      timeoutMs: 60_000,
      env: childEnv({}, dir),
      cwd: dir,
    });
    if (compile.error) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`javac failed to run: ${compile.error.message}`);
    }
    if (compile.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new SubmissionError(cleanJavacError(compile.stderr ?? 'compilation failed', dir));
    }

    // No RLIMIT_AS for the JVM (it reserves far more than it touches); heaps
    // are capped with -Xmx instead — the tracer's here, its target's in
    // VisionDsTracer's launch options.
    const [command, stepperArgs] = sandboxed(bin('java'), [
      '-Xmx256m',
      '-cp',
      tracer,
      'VisionDsTracer',
      dir, // target classpath
      'Main',
      'Solution',
      entry.name,
      String(entry.params.length),
      String(prog.studentStart),
      CAPS_JSON,
    ]);
    return {
      stepper: { command, args: stepperArgs, cwd: dir },
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  },
};

function cleanJavacError(stderr: string, dir: string): string {
  const lines = stderr
    .split('\n')
    .map((l) => l.replaceAll(dir + '/', '').replaceAll('Solution.java', 'solution'))
    .filter((l) => l.trim() && !/^\d+ errors?$/.test(l) && !/^Note:/.test(l));
  const firstError = lines.findIndex((l) => /error:/.test(l));
  const slice = firstError === -1 ? lines : lines.slice(firstError);
  return slice.slice(0, 8).join('\n') || 'compilation failed';
}
