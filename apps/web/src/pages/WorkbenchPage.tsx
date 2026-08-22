import { consumeCapture, pullCaptures } from '@visionds/auth';
import { twoSumFailTrace, type Entry, type TestCase } from '@visionds/trace-schema';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AccountMenu } from '../auth/AccountMenu';
import { PaneToggle } from '../components/PaneToggles';
import { Splitter } from '../components/Splitter';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../auth/AuthProvider';
import { DEFAULT_LANGUAGE, langById } from '../languages';
import { readImportFromHash, type ImportProblem } from '../lib/import';
import { useActiveTrace, useVis } from '../store';
import { SourcePane } from '../workbench/SourcePane';
import { StagePane } from '../workbench/StagePane';
import { readDraft, writeDraft, type WorkbenchDraft } from '../workbench/draft';
import { readLayout, writeLayout, type WorkbenchLayout } from '../workbench/layout';
import { getDefaultSystemCode } from '../workbench/systemCode';
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

  const [language, setLanguage] = useState(restored?.language ?? DEFAULT_LANGUAGE);
  const [code, setCode] = useState(() => restored?.code ?? langById(DEFAULT_LANGUAGE).starterCode);
  const [systemCode, setSystemCode] = useState(restored?.systemCode ?? '');
  const [entry, setEntry] = useState<Entry | undefined>(undefined);
  const [candidates, setCandidates] = useState<Entry[]>([]);
  /** True once the student has directly edited the system-code strip — after
   * that, further code edits stop auto-regenerating it (the student owns it). */
  const [systemCodeDirty, setSystemCodeDirty] = useState(restored?.systemCodeDirty ?? false);
  /** False while a default system-code fetch is in flight — Run is disabled
   * meanwhile, since running against a stale/empty systemCode can produce a
   * broken program server-side (e.g. a C++ translation unit with no main()).
   * A restored *dirty* strip starts ready: the rescan effect below bails out
   * on dirty drafts, so nothing else would ever flip this true again. */
  const [systemCodeReady, setSystemCodeReady] = useState(restored?.systemCodeDirty ?? false);
  const [cases, setCases] = useState<TestCase[]>(
    () => restored?.cases ?? langById(DEFAULT_LANGUAGE).starterCases,
  );
  const [imported, setImported] = useState<ImportProblem | null>(restored?.problem ?? null);

  const trace = useActiveTrace();
  const cursor = useVis((s) => s.cursor);
  const { busy, status, error, setError, run, show } = useRun(client, Boolean(user));

  /**
   * `load()` and the debounced rescan effect below can both fire a
   * `getDefaultSystemCode` fetch for the same edit (e.g. switching languages
   * changes `code`/`language`, which `load()` handles directly *and* which
   * the rescan effect's dependency array also reacts to). Whichever request
   * resolves last would otherwise win, even if it was the stale one — e.g.
   * the rescan effect closing over the *previous* language's `entry` and
   * racing ahead of `load()`'s correct, override-free fetch. Every fetch is
   * tagged with a request generation; only the response matching the latest
   * generation is ever applied.
   */
  const requestGen = useRef(0);

  /**
   * Load a source into the editor, from any of the three entry points. Also
   * runs the entry-candidate scan and resets `systemCodeDirty`, so a freshly
   * loaded/imported/history-reopened solution always gets a fresh default.
   */
  const load = (next: LoadRun) => {
    const def = langById(next.language);
    const nextCode = next.code || def.starterCode;
    setLanguage(def.id);
    setCode(nextCode);
    setCases(next.cases.length ? next.cases : def.starterCases);
    setImported(next.problem ?? null);
    setError(null);
    setSystemCodeDirty(false);
    setSystemCodeReady(false);
    setEntry(undefined);
    const gen = ++requestGen.current;
    void getDefaultSystemCode(def.id, nextCode).then(
      (seed) => {
        if (requestGen.current !== gen) return;
        setSystemCode(seed.systemCode);
        setEntry(seed.entry);
        setCandidates(seed.candidates);
        setSystemCodeReady(true);
      },
      () => {
        if (requestGen.current !== gen) return;
        // No entry point detected yet (e.g. an empty editor) — leave system
        // code blank; the next successful load (or a run) will populate it.
        // Run stays disabled (systemCodeReady false) until it does.
        setSystemCode('');
        setEntry(undefined);
        setCandidates([]);
      },
    );
  };

  /**
   * Re-scan for entry candidates whenever the student's code actually
   * changes — pasting a whole new solution needs this just as much as the
   * initial load does. Debounced so it settles after a paste or a burst of
   * typing rather than firing on every keystroke; skipped once the student
   * has started editing the system-code strip directly, since at that point
   * further auto-regeneration would clobber their edits.
   */
  useEffect(() => {
    if (systemCodeDirty) return;
    setSystemCodeReady(false);
    const timer = setTimeout(() => {
      const gen = ++requestGen.current;
      getDefaultSystemCode(language, code, entry).then(
        (seed) => {
          if (requestGen.current !== gen) return;
          setSystemCode(seed.systemCode);
          setEntry(seed.entry);
          setCandidates(seed.candidates);
          setSystemCodeReady(true);
        },
        () => {
          if (requestGen.current !== gen) return;
          setCandidates([]);
        },
      );
    }, 500);
    return () => clearTimeout(timer);
    // Only the code itself (and language) should trigger a rescan — `entry`
    // is read as "keep the current pick if it still exists", not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, language, systemCodeDirty]);

  /** A dropdown pick: regenerate the call line for a specific candidate. */
  const onPickEntry = (picked: Entry) => {
    setSystemCodeDirty(false);
    setSystemCodeReady(false);
    const gen = ++requestGen.current;
    void getDefaultSystemCode(language, code, picked).then((seed) => {
      if (requestGen.current !== gen) return;
      setSystemCode(seed.systemCode);
      setEntry(seed.entry);
      setSystemCodeReady(true);
    });
  };

  const onSystemCode = (next: string) => {
    setSystemCodeDirty(true);
    setSystemCodeReady(true);
    setSystemCode(next);
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
    const draft: WorkbenchDraft = {
      language,
      code,
      cases,
      systemCode,
      systemCodeDirty,
      problem: imported,
    };
    const timer = setTimeout(() => writeDraft(draft), 400);
    return () => clearTimeout(timer);
  }, [language, code, cases, systemCode, systemCodeDirty, imported]);

  const onRun = () => {
    if (!systemCodeReady) return;
    void run({ language, code, systemCode, entry, cases, problem: imported });
  };

  // ⌘/Ctrl + Enter runs — keyboard-fast, the way the brand wants it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !busy && systemCodeReady) {
        e.preventDefault();
        onRun();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, systemCodeReady, code, systemCode, entry, cases, language, imported]);

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
          {sourceCollapsed && (
            <button
              className="run-btn compact"
              onClick={onRun}
              disabled={busy || !systemCodeReady}
              title="Run & visualize (⌘/Ctrl + ↵)"
            >
              {busy ? (status ?? 'Running…') : !systemCodeReady ? 'Preparing…' : 'Run'}
            </button>
          )}
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
            systemCode={systemCode}
            candidates={candidates}
            cases={cases}
            busy={busy}
            runDisabled={!systemCodeReady}
            status={status}
            error={error}
            activeLine={step?.line ?? null}
            activeLineIsException={Boolean(isException)}
            stale={
              Boolean(trace) && (trace!.code !== code || (trace!.systemCode ?? '') !== systemCode)
            }
            onLanguage={switchLanguage}
            onCode={setCode}
            onSystemCode={onSystemCode}
            onPickEntry={onPickEntry}
            onCases={setCases}
            onRun={onRun}
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
        <StagePane trace={trace} />
      </main>
    </div>
  );
}
