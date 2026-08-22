/// <reference lib="webworker" />
import { runCaseInPyodide, type PyodideLike } from './invoke';
import type { RunRequest, WorkerReply } from './messages';

let pyodidePromise: Promise<PyodideLike> | null = null;

function getPyodide(indexURL: string): Promise<PyodideLike> {
  // Load pyodide.mjs from the served assets rather than bundling the npm
  // package into the worker — identical behavior in dev, build, and a future
  // CDN setup; the assets version is pinned by the pyodide dependency.
  pyodidePromise ??= import(/* @vite-ignore */ `${indexURL}pyodide.mjs`).then(
    (mod: { loadPyodide(opts: { indexURL: string }) : Promise<PyodideLike> }) =>
      mod.loadPyodide({ indexURL }),
  );
  return pyodidePromise;
}

const post = (reply: WorkerReply) => self.postMessage(reply);

self.onmessage = async (e: MessageEvent<RunRequest>) => {
  const { id, input, testCase, indexURL } = e.data;
  try {
    post({ id, type: 'status', status: 'loading' });
    const py = await getPyodide(indexURL);
    post({ id, type: 'status', status: 'running' });
    const trace = runCaseInPyodide(py, input, testCase);
    post({ id, type: 'result', trace });
  } catch (err) {
    post({ id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
