import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listJavaEntryCandidates, type Entry, type TestCase } from '@visionds/trace-schema';
import { CAPS_JSON } from '../../caps';
import { type LanguageAdapter, type PreparedProgram, TraceUserError } from '../types';
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

// The JDI tracer is fixed; compile it once per process into a cache dir.
let tracerClasses: string | null = null;
function ensureTracerCompiled(): string {
  if (tracerClasses && existsSync(join(tracerClasses, 'VisionDsTracer.class'))) return tracerClasses;
  const dir = join(tmpdir(), 'visionds-java-tracer');
  mkdirSync(dir, { recursive: true });
  const res = spawnSync(bin('javac'), ['-d', dir, TRACER_SRC], { encoding: 'utf8', timeout: 60_000 });
  if (res.status !== 0) throw new Error(`failed to compile JDI tracer: ${res.stderr ?? ''}`);
  return (tracerClasses = dir);
}

/**
 * Java adapter: writes Solution.java + Main.java, compiles them with debug info,
 * and steps Main under the JDI tracer. Compile errors become TraceUserError so
 * they surface as an `error` verdict.
 */
export const javaAdapter: LanguageAdapter = {
  language: 'java',
  prepare(studentCode: string, systemCode: string, entry: Entry, testCase: TestCase): PreparedProgram {
    // The wire-level Entry only carries {name, className}; recover the full
    // signature (needed to type argument decls) from the current code.
    const resolved = listJavaEntryCandidates(studentCode).find((c) => c.name === entry.name) ?? {
      name: entry.name,
      returnType: 'void',
      params: [],
    };
    const prog = assembleJavaProgram(studentCode, systemCode, resolved, testCase);
    const tracer = ensureTracerCompiled();

    const dir = mkdtempSync(join(tmpdir(), 'visionds-java-'));
    const solPath = join(dir, 'Solution.java');
    const mainPath = join(dir, 'Main.java');
    writeFileSync(solPath, prog.solution, 'utf8');
    writeFileSync(mainPath, prog.main, 'utf8');

    const compile = spawnSync(bin('javac'), ['-g', '-d', dir, solPath, mainPath], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    if (compile.status !== 0) {
      rmSync(dir, { recursive: true, force: true });
      throw new TraceUserError(cleanJavacError(compile.stderr ?? 'compilation failed', dir));
    }

    return {
      stepper: {
        command: bin('java'),
        args: [
          '-cp',
          tracer,
          'VisionDsTracer',
          dir, // target classpath
          'Main',
          'Solution',
          prog.entry,
          String(prog.studentStart),
          CAPS_JSON,
        ],
      },
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
