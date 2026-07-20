import { python } from '@codemirror/lang-python';
import CodeMirror from '@uiw/react-codemirror';
import { twoSumFailTrace, type ExecutionTrace, type TestCase } from '@visionds/trace-schema';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runner } from '../runner';
import { useVis } from '../store';

const STARTER_CODE = `def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, i]  # bug: should be [i, j]
`;

const STARTER_CASES: TestCase[] = [
  { input: '[2,7,11,15]\n9', expected: '[0,1]' },
  { input: '[3,2,4]\n6', expected: '[1,2]' },
];

export function PastePage() {
  const navigate = useNavigate();
  const setTraces = useVis((s) => s.setTraces);
  const [code, setCode] = useState(STARTER_CODE);
  const [cases, setCases] = useState<TestCase[]>(STARTER_CASES);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateCase = (i: number, patch: Partial<TestCase>) =>
    setCases((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

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
  }, [busy, code, cases]);

  const show = (traces: ExecutionTrace[]) => {
    const failing = traces.findIndex((t) => t.result.verdict !== 'pass');
    setTraces(traces, failing === -1 ? 0 : failing);
    navigate('/run');
  };

  const onRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const traces: ExecutionTrace[] = [];
      for (let i = 0; i < cases.length; i++) {
        setStatus(`Testcase ${i + 1} of ${cases.length}…`);
        traces.push(
          await runner.run(code, cases[i]!, {
            onStatus: (s) =>
              setStatus(
                s === 'loading'
                  ? 'Loading Python runtime (first run only)…'
                  : `Running testcase ${i + 1} of ${cases.length}…`,
              ),
          }),
        );
      }
      show(traces);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  return (
    <div className="paste-page">
      <header className="page-header">
        <h1>VisionDS</h1>
        <p className="tagline">Paste your code, watch it run, see exactly where it breaks.</p>
        {/* slot: "imported from LeetCode" metadata lands here when the extension exists */}
        <div className="import-slot">
          Paste manually below — importing straight from LeetCode is coming soon.
        </div>
      </header>

      <section className="editor-section">
        <h2>Your Python solution</h2>
        <p className="hint">
          A top-level function or a LeetCode-style <code>class Solution</code>.
        </p>
        <CodeMirror
          value={code}
          height="320px"
          theme="dark"
          extensions={[python()]}
          onChange={setCode}
        />
      </section>

      <section className="cases-section">
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

      <section className="run-section">
        <button className="run-btn" onClick={onRun} disabled={busy}>
          {busy ? status ?? 'Running…' : 'Run & visualize'}
        </button>
        {!busy && (
          <span className="run-hint">
            <kbd>⌘</kbd>
            <kbd>↵</kbd>
          </span>
        )}
        <button className="demo-btn" onClick={() => show([twoSumFailTrace])} disabled={busy}>
          Load demo trace
        </button>
        {error && <div className="error-note">{error}</div>}
      </section>
    </div>
  );
}
