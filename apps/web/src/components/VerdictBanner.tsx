import { fmt } from '../lib/format';
import { useVis } from '../store';

export function VerdictBanner() {
  const traces = useVis((s) => s.traces);
  const active = useVis((s) => s.active);
  const setActive = useVis((s) => s.setActive);
  const seek = useVis((s) => s.seek);
  const trace = traces[active];
  if (!trace) return null;

  const { result } = trace;
  const div = result.divergenceStepIndex;

  return (
    <div className={`verdict-banner ${result.verdict}`}>
      {traces.length > 1 && (
        <span className="case-switch">
          {traces.map((t, i) => (
            <button
              key={i}
              className={`case-chip ${t.result.verdict}${i === active ? ' current' : ''}`}
              onClick={() => setActive(i)}
              title={`testcase ${i + 1}: ${t.result.verdict}`}
            >
              {i + 1}
            </button>
          ))}
        </span>
      )}
      <strong className="verdict-word">{result.verdict.toUpperCase()}</strong>
      {result.verdict === 'fail' && (
        <span className="verdict-detail">
          expected <code>{result.expected}</code> but got <code>{fmt(result.actual)}</code>
        </span>
      )}
      {result.verdict === 'error' && (
        <span className="verdict-detail">
          <code>{result.message}</code>
        </span>
      )}
      {result.verdict === 'timeout' && (
        <span className="verdict-detail">
          {result.message ?? 'execution was cut off'} — trace truncated
        </span>
      )}
      {div !== undefined && (
        <button className="jump-btn" onClick={() => seek(div)}>
          Jump to failing step →
        </button>
      )}
    </div>
  );
}
