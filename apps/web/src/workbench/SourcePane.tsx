import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import type { Entry, TestCase } from '@visionds/trace-schema';
import { useEffect, useMemo, useRef } from 'react';
import { activeLineExtension, showActiveLine } from '../editorActiveLine';
import { editorTheme } from '../editorTheme';
import { LANGUAGES, langById } from '../languages';
import { useTheme } from '../theme/useTheme';

const LANG_MODE = { cpp, java, python } as const;

export interface SourcePaneProps {
  language: string;
  code: string;
  /** The generated, editable wiring (imports/call-site) — collapsed by default. */
  systemCode: string;
  /** Entry candidates found at load time; the picker only shows when there's real ambiguity. */
  candidates: Entry[];
  cases: TestCase[];
  busy: boolean;
  /** True while the default system code is still being (re)generated — Run
   * is disabled meanwhile, so it never fires against a stale/empty pairing. */
  runDisabled: boolean;
  status: string | null;
  error: string | null;
  /** Line to mark during playback; null when idle. */
  activeLine: number | null;
  activeLineIsException: boolean;
  /** True when the editor no longer matches the code that produced the trace. */
  stale: boolean;
  onLanguage: (id: string) => void;
  onCode: (code: string) => void;
  onSystemCode: (code: string) => void;
  onPickEntry: (entry: Entry) => void;
  onCases: (update: (cases: TestCase[]) => TestCase[]) => void;
  onRun: () => void;
  onDemo?: () => void;
}

/**
 * The input half of the workbench: language, source, testcases, run.
 *
 * The editor doubles as the playback code panel — `activeLine` marks the
 * current step in place, so there is only ever one copy of your source on
 * screen.
 */
export function SourcePane({
  language,
  code,
  systemCode,
  candidates,
  cases,
  busy,
  runDisabled,
  status,
  error,
  activeLine,
  activeLineIsException,
  stale,
  onLanguage,
  onCode,
  onSystemCode,
  onPickEntry,
  onCases,
  onRun,
  onDemo,
}: SourcePaneProps) {
  const editor = useRef<ReactCodeMirrorRef>(null);

  useEffect(() => {
    showActiveLine(editor.current?.view, {
      line: activeLine,
      isException: activeLineIsException,
    });
  }, [activeLine, activeLineIsException]);

  // rebuilt when the language or the theme changes — CodeMirror bakes colors
  // into its own stylesheet, so a retheme needs a fresh extension set
  const { theme } = useTheme();
  const extensions = useMemo(
    () => [
      (LANG_MODE[language as keyof typeof LANG_MODE] ?? python)(),
      activeLineExtension,
      ...editorTheme(theme),
    ],
    [language, theme],
  );
  const updateCase = (i: number, patch: Partial<TestCase>) =>
    onCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <section className="pane pane-source frame" aria-label="Your solution">
      <header className="pane-head">
        <span className="pane-title">Source</span>
        <div className="lang-tabs" role="tablist" aria-label="Language">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={l.id === language}
              className={`lang-tab${l.id === language ? ' active' : ''}${l.enabled ? '' : ' soon'}`}
              onClick={() => onLanguage(l.id)}
              disabled={!l.enabled}
              title={
                l.enabled
                  ? `${l.label} — runs ${l.runsIn === 'server' ? 'on the trace service' : 'in your browser'}`
                  : `${l.label} — coming soon`
              }
            >
              {l.label}
              {!l.enabled && <span className="soon-tag">soon</span>}
            </button>
          ))}
        </div>
      </header>

      {candidates.length >= 2 && (
        <div className="entry-picker">
          <label>
            <span>Ambiguous entry point — run:</span>
            <select
              onChange={(e) => {
                const picked = candidates[Number(e.target.value)];
                if (picked) onPickEntry(picked);
              }}
            >
              {candidates.map((c, i) => (
                <option key={`${c.className ?? ''}.${c.name}`} value={i}>
                  {c.className ? `${c.className}.${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <details className="system-code">
        <summary>System code (auto-generated, editable)</summary>
        <CodeMirror value={systemCode} theme="none" extensions={extensions} onChange={onSystemCode} />
      </details>

      {/* The editor takes its height from this flex row, never a percentage of
          a scrolling parent — CodeMirror re-measures on every layout change
          and a percentage inside an auto-height ancestor loops forever. */}
      <div className="editor-holder">
        <CodeMirror
          ref={editor}
          value={code}
          theme="none"
          extensions={extensions}
          onChange={onCode}
        />
      </div>
      {stale && (
        <p className="stale-note">
          Edited since this run — the diagram still shows the previous execution.
        </p>
      )}

      <div className="pane-scroll">
        <div className="cases">
          <div className="cases-head">
            <span className="pane-title">Testcases</span>
            <span className="cases-hint">one argument per line</span>
          </div>
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
                <span>Expected</span>
                <input
                  value={c.expected}
                  onChange={(e) => updateCase(i, { expected: e.target.value })}
                />
              </label>
              <button
                className="remove-case"
                onClick={() => onCases((cs) => cs.filter((_, j) => j !== i))}
                disabled={cases.length === 1}
                aria-label="remove testcase"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="add-case"
            onClick={() => onCases((cs) => [...cs, { input: '', expected: '' }])}
          >
            + Add testcase
          </button>
        </div>
      </div>

      <footer className="pane-foot">
        <button className="run-btn" onClick={onRun} disabled={busy || runDisabled}>
          {busy ? (status ?? 'Running…') : runDisabled ? 'Preparing…' : 'Run & visualize'}
        </button>
        {!busy && (
          <span className="run-hint">
            <kbd>⌘</kbd>
            <kbd>↵</kbd>
          </span>
        )}
        {onDemo && !busy && (
          <button className="demo-btn" onClick={onDemo}>
            Demo trace
          </button>
        )}
        <span className="run-where">
          {langById(language).runsIn === 'server' ? 'trace service' : 'this browser'}
        </span>
      </footer>

      {error && <div className="error-note">{error}</div>}
    </section>
  );
}
