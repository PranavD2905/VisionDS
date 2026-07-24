import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import CodeMirror from '@uiw/react-codemirror';
import { consumeCapture, pullCaptures, saveRun } from '@visionds/auth';
import { twoSumFailTrace, type ExecutionTrace, type TestCase } from '@visionds/trace-schema';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AccountMenu } from '../auth/AccountMenu';
import { useAuth } from '../auth/AuthProvider';
import { editorTheme } from '../editorTheme';
import { DEFAULT_LANGUAGE, LANGUAGES, langById } from '../languages';
import { readImportFromHash, type ImportProblem } from '../lib/import';
import { runnerFor } from '../runner';
import { useVis } from '../store';

interface LoadRun {
  language: string;
  code: string;
  cases: TestCase[];
  problem?: ImportProblem;
}

export function PastePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setTraces = useVis((s) => s.setTraces);
  const { user, client } = useAuth();
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [code, setCode] = useState(() => langById(DEFAULT_LANGUAGE).starterCode);
  const [cases, setCases] = useState<TestCase[]>(() => langById(DEFAULT_LANGUAGE).starterCases);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<ImportProblem | null>(null);

  // Hydrate from a `#import=…` handoff written by the browser extension.
  // Runs once on mount; clears the hash so a refresh doesn't re-import.
  useEffect(() => {
    const payload = readImportFromHash();
    if (!payload) return;
    const def = langById(payload.language);
    setLanguage(def.id);
    setCode(payload.code || def.starterCode);
    setCases(payload.cases.length ? payload.cases : def.starterCases);
    setImported(payload.problem ?? {});
    setError(null);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-open a run picked from history (navigated here with location state).
  useEffect(() => {
    const loadRun = (location.state as { loadRun?: LoadRun } | null)?.loadRun;
    if (!loadRun) return;
    const def = langById(loadRun.language);
    setLanguage(def.id);
    setCode(loadRun.code || def.starterCode);
    setCases(loadRun.cases.length ? loadRun.cases : def.starterCases);
    setImported(loadRun.problem ?? null);
    setError(null);
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // Pull the newest capture synced from the signed-in browser extension.
  useEffect(() => {
    if (!client || !user) return;
    let alive = true;
    pullCaptures(client, 1)
      .then((rows) => {
        const cap = rows[0];
        if (!alive || !cap) return;
        const def = langById(cap.language);
        setLanguage(def.id);
        setCode(cap.code || def.starterCode);
        setCases(cap.testcases.length ? cap.testcases : def.starterCases);
        setImported(cap.problem ?? {});
        setError(null);
        void consumeCapture(client, cap.id).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [client, user]);

  const updateCase = (i: number, patch: Partial<TestCase>) =>
    setCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  // Switching language loads that language's starter code + cases.
  const switchLanguage = (id: string) => {
    const def = langById(id);
    if (!def.enabled || id === language) return;
    setLanguage(id);
    setCode(def.starterCode);
    setCases(def.starterCases);
    setError(null);
  };

  // ⌘/Ctrl + Enter runs — keyboard-fast, the way the brand wants it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !busy) {
        e.preventDefault();
        void onRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, code, cases, language]);

  const show = (traces: ExecutionTrace[]) => {
    const failing = traces.findIndex((t) => t.result.verdict !== 'pass');
    setTraces(traces, failing === -1 ? 0 : failing);
    navigate('/run');
  };

  // Save the run to the signed-in user's history. Best-effort: a failed save
  // never blocks the visualization.
  const persistRun = (traces: ExecutionTrace[]) => {
    if (!client || !user) return;
    const shown = traces.find((t) => t.result.verdict !== 'pass') ?? traces[0];
    void saveRun(client, {
      language,
      code,
      testcases: cases,
      problem: imported ?? null,
      verdict: shown?.result.verdict ?? null,
    }).catch(() => {});
  };

  const onRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const runner = runnerFor(language);
      const traces: ExecutionTrace[] = [];
      for (let i = 0; i < cases.length; i++) {
        setStatus(`Testcase ${i + 1} of ${cases.length}…`);
        traces.push(
          await runner.run(code, cases[i]!, {
            onStatus: (s) =>
              setStatus(
                s === 'loading'
                  ? runner.capabilities.runsIn === 'server'
                    ? 'Compiling & tracing on the server…'
                    : 'Loading Python runtime (first run only)…'
                  : `Running testcase ${i + 1} of ${cases.length}…`,
              ),
          }),
        );
      }
      persistRun(traces);
      show(traces);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const editorLang = language === 'cpp' ? cpp() : language === 'java' ? java() : python();

  return (
    <div className="paste-page">
      <div className="app-bar frame">
        <Link to="/" className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">
            ▚
          </span>
          <span>
            VISION<span className="wordmark-dim">DS</span>
          </span>
        </Link>
        <span className="app-crumb">/ workbench</span>
        <div className="app-bar-right">
          <Link to="/product" className="app-bar-link">
            Spec
          </Link>
          <AccountMenu />
        </div>
      </div>

      <header className="page-header frame">
        <p className="stamp">
          <span className="led" aria-hidden="true" />
          {langById(language).runsIn === 'server' ? 'Trace service · port 8787' : 'Local runtime · this tab'}
        </p>
        <h1>Paste it. Watch it run.</h1>
        <p className="tagline">
          A real execution gets recorded, then replayed as a diagram — and the failing step is one
          click away.
        </p>
        {/* slot: "imported from LeetCode" metadata lands here via the extension handoff */}
        {imported ? (
          <div className="import-badge">
            Imported from LeetCode
            {imported.title ? (
              imported.url ? (
                <a href={imported.url} target="_blank" rel="noreferrer">
                  {imported.title}
                </a>
              ) : (
                <strong>{imported.title}</strong>
              )
            ) : null}
          </div>
        ) : (
          <div className="import-slot">
            Paste below, or lift the code &amp; testcases straight off LeetCode with the VisionDS
            extension.
          </div>
        )}
      </header>

      <section className="editor-section frame">
        <div className="editor-head">
          <h2>Your solution</h2>
          <div className="lang-tabs" role="tablist" aria-label="Language">
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                role="tab"
                aria-selected={l.id === language}
                className={`lang-tab${l.id === language ? ' active' : ''}${l.enabled ? '' : ' soon'}`}
                onClick={() => switchLanguage(l.id)}
                disabled={!l.enabled}
                title={l.enabled ? `${l.label} — runs ${l.runsIn === 'server' ? 'on the trace service' : 'in your browser'}` : `${l.label} — coming soon`}
              >
                {l.label}
                {!l.enabled && <span className="soon-tag">soon</span>}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">
          {language === 'python' ? (
            <>A top-level function or a LeetCode-style <code>class Solution</code>.</>
          ) : (
            <>A <code>class Solution</code> with a public method (LeetCode style). Compiled &amp; traced on the local trace service.</>
          )}
        </p>
        <CodeMirror
          value={code}
          height="320px"
          theme="none"
          extensions={[editorLang, ...editorTheme()]}
          onChange={setCode}
        />
      </section>

      <section className="cases-section frame">
        <h2>Testcases</h2>
        <p className="hint">One argument per line, like LeetCode shows them (e.g. <code>[2,7,11,15]</code> then <code>9</code>).</p>
        {cases.map((c, i) => (
          <div className="case-row" key={i}>
            <label>
              <span>Input</span>
              <textarea
                value={c.input}
                rows={2}
                onChange={(e) => updateCase(i, { input: e.target.value })}
              />
            </label>
            <label>
              <span>Expected output</span>
              <input
                value={c.expected}
                onChange={(e) => updateCase(i, { expected: e.target.value })}
              />
            </label>
            <button
              className="remove-case"
              onClick={() => setCases((cs) => cs.filter((_, j) => j !== i))}
              disabled={cases.length === 1}
              aria-label="remove testcase"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          className="add-case"
          onClick={() => setCases((cs) => [...cs, { input: '', expected: '' }])}
        >
          + Add testcase
        </button>
      </section>

      <section className="run-section frame">
        <button className="run-btn" onClick={onRun} disabled={busy}>
          {busy ? status ?? 'Running…' : 'Run & visualize'}
        </button>
        {!busy && (
          <span className="run-hint">
            <kbd>⌘</kbd>
            <kbd>↵</kbd>
          </span>
        )}
        {language === 'python' && (
          <button className="demo-btn" onClick={() => show([twoSumFailTrace])} disabled={busy}>
            Load demo trace
          </button>
        )}
        {error && <div className="error-note">{error}</div>}
      </section>
    </div>
  );
}
