import { consumeCapture, pullCaptures } from '@visionds/auth';
import { twoSumFailTrace, type TestCase } from '@visionds/trace-schema';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AccountMenu } from '../auth/AccountMenu';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_LANGUAGE, langById } from '../languages';
import { readImportFromHash, type ImportProblem } from '../lib/import';
import { useActiveTrace, useVis } from '../store';
import { SourcePane } from '../workbench/SourcePane';
import { StagePane } from '../workbench/StagePane';
import { useRun } from '../workbench/useRun';

interface LoadRun {
  language: string;
  code: string;
  cases: TestCase[];
  problem?: ImportProblem;
}

/**
 * The workbench: editing and visualization on one screen.
 *
 * Source on the left, stage on the right, and a single copy of your code —
 * the editor stays editable and marks the current step in place during
 * playback. Its own job is holding the source/testcase state and wiring the
 * two panes together; running lives in `useRun`, drawing in the panes.
 */
export function WorkbenchPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, client } = useAuth();

  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [code, setCode] = useState(() => langById(DEFAULT_LANGUAGE).starterCode);
  const [cases, setCases] = useState<TestCase[]>(() => langById(DEFAULT_LANGUAGE).starterCases);
  const [imported, setImported] = useState<ImportProblem | null>(null);

  const trace = useActiveTrace();
  const cursor = useVis((s) => s.cursor);
  const { busy, status, error, setError, run, show } = useRun(client, Boolean(user));

  /** Load a source into the editor, from any of the three entry points. */
  const load = (next: LoadRun) => {
    const def = langById(next.language);
    setLanguage(def.id);
    setCode(next.code || def.starterCode);
    setCases(next.cases.length ? next.cases : def.starterCases);
    setImported(next.problem ?? null);
    setError(null);
  };

  // Hydrate from a `#import=…` handoff written by the browser extension.
  useEffect(() => {
    const payload = readImportFromHash();
    if (!payload) return;
    load({ ...payload, problem: payload.problem ?? {} });
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-open a run picked from history (navigated here with location state).
  useEffect(() => {
    const loadRun = (location.state as { loadRun?: LoadRun } | null)?.loadRun;
    if (!loadRun) return;
    load(loadRun);
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
        load({
          language: cap.language,
          code: cap.code,
          cases: cap.testcases,
          problem: cap.problem ?? {},
        });
        void consumeCapture(client, cap.id).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, user]);

  const onRun = () => void run({ language, code, cases, problem: imported });

  // ⌘/Ctrl + Enter runs — keyboard-fast, the way the brand wants it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !busy) {
        e.preventDefault();
        onRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, code, cases, language, imported]);

  // Switching language loads that language's starter code + cases.
  const switchLanguage = (id: string) => {
    const def = langById(id);
    if (!def.enabled || id === language) return;
    load({ language: id, code: def.starterCode, cases: def.starterCases });
  };

  const step = trace?.steps[cursor];
  const isException =
    step?.event === 'exception' ||
    (trace?.result.verdict === 'error' && cursor === trace.result.divergenceStepIndex);

  return (
    <div className="workbench">
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

        {imported && (
          <span className="import-badge">
            {imported.url ? (
              <a href={imported.url} target="_blank" rel="noreferrer">
                {imported.title ?? 'LeetCode'}
              </a>
            ) : (
              <strong>{imported.title ?? 'LeetCode'}</strong>
            )}
          </span>
        )}

        <div className="app-bar-right">
          <Link to="/product" className="app-bar-link">
            Spec
          </Link>
          <AccountMenu />
        </div>
      </div>

      <main className="workbench-split">
        <SourcePane
          language={language}
          code={code}
          cases={cases}
          busy={busy}
          status={status}
          error={error}
          activeLine={step?.line ?? null}
          activeLineIsException={Boolean(isException)}
          stale={Boolean(trace) && trace!.code !== code}
          onLanguage={switchLanguage}
          onCode={setCode}
          onCases={setCases}
          onRun={onRun}
          onDemo={language === 'python' ? () => show([twoSumFailTrace]) : undefined}
        />
        <StagePane trace={trace} />
      </main>
    </div>
  );
}
