import { PyodideRunner, ServerRunner, type Runner } from '@visionds/runners';

/**
 * Runner registry — picks the execution backend by language. Python traces in
 * the browser via Pyodide (offline, nothing leaves the machine); compiled
 * languages route to the server-side trace service. Every runner returns the
 * same ExecutionTrace, so the rest of the app is language-agnostic.
 */
const TRACE_SERVICE_ENDPOINT =
  (import.meta.env.VITE_TRACE_SERVICE as string | undefined) ?? 'http://localhost:8787';

const pyodide = new PyodideRunner();
const serverRunners = new Map<string, Runner>();

export function runnerFor(language: string): Runner {
  if (language === 'python') return pyodide;
  let runner = serverRunners.get(language);
  if (!runner) {
    runner = new ServerRunner(language, { endpoint: TRACE_SERVICE_ENDPOINT });
    serverRunners.set(language, runner);
  }
  return runner;
}
