import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { python } from '@codemirror/lang-python';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import type { Entry, TestCase } from '@visionds/trace-schema';
import { useEffect, useMemo, useRef } from 'react';
import { Splitter } from '../components/Splitter';
import { activeLineExtension, showActiveLine } from '../editorActiveLine';
import { editorTheme } from '../editorTheme';
import { LANGUAGES, langById } from '../languages';
import { useTheme } from '../theme/useTheme';

const LANG_MODE = { cpp, java, python } as const;

/** The panel's id, so the app-bar toggles can point at what they show and hide. */
export const SOURCE_PANE_ID = 'source-pane';

export interface SourcePaneProps {
  language: string;
  code: string;
  /** The generated, editable wiring (imports/call-site) — collapsed by default. */
  systemCode: string;
  /** Entry candidates found at load time; the picker only shows when there's real ambiguity. */
  candidates: Entry[];
  /** The entry the current `systemCode` was actually generated for. */
  entry: Entry | undefined;
  cases: TestCase[];
  /** A run is in flight. Run itself lives beside the verdict in the stage pane. */
  busy: boolean;
  error: string | null;
  /** Line to mark during playback; null when idle. */
  activeLine: number | null;
  activeLineIsException: boolean;
  /** True when the editor no longer matches the code that produced the trace. */
  stale: boolean;
  /** Fraction of the pane given to the editor; the testcases take the rest. */
  editorSplit: number;
  onEditorSplit: (value: number) => void;
  /** The whole panel is collapsed. It stays mounted, only hidden, so the
   * editor keeps its undo history, cursor and scroll for when it comes back. */
  hidden: boolean;
  /** Testcases region visibility, driven by the app-bar toggle. */
  casesOpen: boolean;
  onLanguage: (id: string) => void;
  onCode: (code: string) => void;
  onSystemCode: (code: string) => void;
  onPickEntry: (entry: Entry) => void;
  onCases: (update: (cases: TestCase[]) => TestCase[]) => void;
  onDemo?: () => void;
}

/**
 * The input half of the workbench: language, source, testcases. Run sits
 * beside the verdict in the stage pane, next to "Jump to failing step".
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
  entry,
  cases,
  busy,
  error,
  activeLine,
  activeLineIsException,
  stale,
  editorSplit,
  onEditorSplit,
  hidden,
  casesOpen,
  onLanguage,
  onCode,
  onSystemCode,
  onPickEntry,
  onCases,
  onDemo,
}: SourcePaneProps) {
  const editor = useRef<ReactCodeMirrorRef>(null);
  const splitRef = useRef<HTMLDivElement>(null);

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
  // -1 while a rescan is in flight and the entry is momentarily unknown; the
  // select then shows no option rather than silently naming the wrong one.
  const selectedEntryIndex = entry
    ? candidates.findIndex((c) => c.name === entry.name && c.className === entry.className)
    : -1;

  const updateCase = (i: number, patch: Partial<TestCase>) =>
    onCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  return (
    <section
      id={SOURCE_PANE_ID}
      className="pane pane-source frame"
      aria-label="Your solution"
      hidden={hidden}
    >
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
            {/* Controlled: an uncontrolled select keeps whatever the DOM last
                showed, so after a debounced rescan re-renders the candidates it
                could name a different function than `systemCode` was built
                for. `entry` is the single source of truth. */}
            <select
              value={selectedEntryIndex}
              onChange={(e) => {
                const picked = candidates[Number(e.target.value)];
                if (picked) onPickEntry(picked);
              }}
            >
              {candidates.map((c, i) => (
                <option key={`${i}:${c.className ?? ''}.${c.name}`} value={i}>
                  {c.className ? `${c.className}.${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <details className="system-code">
        <summary>System code (auto-generated, editable)</summary>
        <CodeMirror
          value={systemCode}
          theme="none"
          extensions={extensions}
          onChange={onSystemCode}
        />
      </details>

      {/* Editor and testcases share this region, split by the drag handle.
          The editor takes its height from the grid row, never a percentage of
          a scrolling parent — CodeMirror re-measures on every layout change
          and a percentage inside an auto-height ancestor loops forever. */}
      {/* Testcases visibility drives the row template: collapsed, the editor
          takes the whole pane, and the drag handle goes away because there is
          no longer a boundary to move. */}
      <div
        className={`source-split${casesOpen ? '' : ' single'}`}
        ref={splitRef}
        style={{ ['--editor-split' as string]: editorSplit }}
      >
        {/* editor + its stale note are one grid row, so the row count stays
            fixed whether or not the note is showing */}
        <div className="editor-region">
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
        </div>

        {casesOpen && (
          <Splitter
            orientation="horizontal"
            value={editorSplit}
            onChange={onEditorSplit}
            containerRef={splitRef}
            min={0.2}
            max={0.85}
            label="Resize editor and testcases"
          />
        )}

        {casesOpen && (
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
        )}
      </div>

      <footer className="pane-foot">
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
