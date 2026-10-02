import { consumeCapture, pullCaptures } from '@visionds/auth';
import { twoSumFailTrace, type TestCase } from '@visionds/trace-schema';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AccountMenu } from '../auth/AccountMenu';
import { PaneToggle } from '../components/PaneToggles';
import { Splitter } from '../components/Splitter';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_LANGUAGE, langById } from '../languages';
import { readImportFromHash, type ImportProblem } from '../lib/import';
import { warmUp } from '../runner';
import { useActiveTrace, useVis } from '../store';
import { SourcePane } from '../workbench/SourcePane';
import { StagePane } from '../workbench/StagePane';
import { readDraft, writeDraft } from '../workbench/draft';
import { readLayout, writeLayout, type WorkbenchLayout } from '../workbench/layout';
import { deriveSource, sourceReducer, type SourceState } from '../workbench/source';
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

  /**
   * What the student last had on screen, restored from localStorage. Read once
   * so every piece of initial state agrees on the same snapshot. A `#import=`
   * handoff, a history re-open and an extension capture all still win over it —
   * they call `load()` from effects that run after this initial state is set.
   */
  const [restored] = useState(readDraft);

  /** Pane sizes — dragged by the splitters, persisted per browser. */
  const [layout, setLayout] = useState<WorkbenchLayout>(readLayout);
  const splitRef = useRef<HTMLElement>(null);
  const setSplit = (split: number) => setLayout((l) => ({ ...l, split }));
  const toggleRegion = (key: 'codeOpen' | 'casesOpen') =>
    setLayout((l) => ({ ...l, [key]: !l[key] }));
  /** Both regions collapsed: nothing left to edit, so the stage takes the room. */
  const sourceCollapsed = !layout.codeOpen && !layout.casesOpen;
  const setEditorSplit = (editorSplit: number) => setLayout((l) => ({ ...l, editorSplit }));
  useEffect(() => {
    const timer = setTimeout(() => writeLayout(layout), 300);
    return () => clearTimeout(timer);
  }, [layout]);

  /**
   * The source being edited — language, code, testcases, call-site choice —
   * held by one pure reducer. The call site, its entry point and the picker's
   * candidates are *derived* from it synchronously (the entry policy parses
   * in the browser), so there is no fetch to race, no "preparing" state and
   * no flag that can disagree with another.
   */
  const [source, dispatch] = useReducer(sourceReducer, restored, (r): SourceState => {
    const def = langById(DEFAULT_LANGUAGE);
    return r ?? {
      language: def.id,
      code: def.starterCode,
      cases: def.starterCases,
      callSite: { kind: 'auto' },
      problem: null,
    };
  });
  const { language, code, cases, problem: imported } = source;
  useEffect(() => warmUp(language), [language]);
  const view = useMemo(
    () => deriveSource(source),
    // the testcases never change what the call site resolves to
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source.language, source.code, source.callSite],
  );

  const trace = useActiveTrace();
  const cursor = useVis((s) => s.cursor);
  const { busy, status, error, setError, run, show } = useRun(client, Boolean(user));

  /** Load a source from any of the three entry points; the call site goes back to auto. */
  const load = (next: LoadRun) => {
    setError(null);
    dispatch({ type: 'load', ...next, problem: next.problem ?? null });
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

  /**
   * Mirror the draft back to storage. Debounced so a burst of typing writes
   * once it settles rather than on every keystroke.
   */
  useEffect(() => {
    const timer = setTimeout(() => writeDraft(source), 400);
    return () => clearTimeout(timer);
  }, [source]);

  // Run is never blocked on the call site: one that can't resolve comes back
  // as an `error` verdict naming the problem, like any other submission error.
  const onRun = () => {
    void run({ language, code, systemCode: view.callSite, cases, problem: imported });
  };

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
  }, [busy, source, view.callSite]);

  // Switching language loads that language's starter code + cases.
  const switchLanguage = (id: string) => {
    const def = langById(id);
    if (!def.enabled || id === language) return;
    load({ language: id, code: def.starterCode, cases: def.starterCases });
  };

  // The one Run button: it sits in the stage header beside "Jump to failing
  // step", so it stays reachable however the source pane is collapsed.
  const runButton = (
    <button
      className="run-btn compact"
      onClick={onRun}
      disabled={busy}
      title="Run & visualize (⌘/Ctrl + ↵)"
      aria-keyshortcuts="Meta+Enter Control+Enter"
    >
      {busy ? (status ?? 'Running…') : 'Run & visualize'}
    </button>
  );

  const step = trace?.steps[cursor];
  const isException =
    step?.event === 'exception' ||
    (trace?.result.verdict === 'error' && cursor === trace.result.divergenceStepIndex);

  return (
    <div className="workbench">
      <div className="app-bar frame">
        <Link to="/" className="wordmark" aria-label="VisionDS home">
          <img src="/logo.svg" className="wordmark-logo" alt="" aria-hidden="true" />
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
          <div className="pane-toggles" role="group" aria-label="Toggle panes">
            <PaneToggle
              region="code"
              on={layout.codeOpen}
              onToggle={() => toggleRegion('codeOpen')}
              label="the code editor"
            />
            <PaneToggle
              region="cases"
              on={layout.casesOpen}
              onToggle={() => toggleRegion('casesOpen')}
              label="the testcases"
            />
          </div>
          <ThemeToggle />
          <AccountMenu />
        </div>
      </div>

      <main
        className={`workbench-split${sourceCollapsed ? ' source-collapsed' : ''}`}
        ref={splitRef}
        style={{ ['--split' as string]: layout.split }}
      >
        {!sourceCollapsed && (
          <SourcePane
            editorSplit={layout.editorSplit}
            onEditorSplit={setEditorSplit}
            codeOpen={layout.codeOpen}
            casesOpen={layout.casesOpen}
            language={language}
            code={code}
            source={view}
            callSiteEdited={source.callSite.kind === 'edited'}
            cases={cases}
            busy={busy}
            error={error}
            activeLine={step?.line ?? null}
            activeLineIsException={Boolean(isException)}
            stale={
              Boolean(trace) && (trace!.code !== code || (trace!.systemCode ?? '') !== view.callSite)
            }
            onLanguage={switchLanguage}
            onCode={(next) => dispatch({ type: 'editCode', code: next })}
            onCallSite={(text) => dispatch({ type: 'editCallSite', text })}
            onResetCallSite={() => dispatch({ type: 'resetCallSite' })}
            onPickEntry={(entry) => dispatch({ type: 'pickEntry', entry })}
            onCases={(update) => dispatch({ type: 'editCases', update })}
            onDemo={language === 'python' ? () => show([twoSumFailTrace]) : undefined}
          />
        )}
        {!sourceCollapsed && (
          <Splitter
            orientation="vertical"
            value={layout.split}
            onChange={setSplit}
            containerRef={splitRef}
            min={0.22}
            max={0.78}
            label="Resize source and stage panes"
          />
        )}
        <StagePane trace={trace} runAction={runButton} />
      </main>
    </div>
  );
}
