import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CodePanel } from '../components/CodePanel';
import { ExplainPanel } from '../components/ExplainPanel';
import { Stage } from '../components/Stage';
import { Transport } from '../components/Transport';
import { VerdictBanner } from '../components/VerdictBanner';
import { inferShapes, type StructShape } from '../lib/shapes';
import { useActiveTrace, useVis } from '../store';

export function RunPage() {
  const trace = useActiveTrace();
  const cursor = useVis((s) => s.cursor);
  const explanation = useVis((s) => s.explanation);
  const [showCode, setShowCode] = useState(true);

  // behavior-inferred structure shapes (stack/queue), computed once per trace
  const shapes = useMemo<Map<string, StructShape>>(
    () => (trace ? inferShapes(trace) : new Map()),
    [trace],
  );

  // subtitle-style narration: latest AI caption at or before the cursor
  const caption = explanation?.annotations
    .filter((a) => a.stepIndex <= cursor)
    .at(-1);

  if (!trace) return <Navigate to="/" replace />;

  const step = trace.steps[cursor];
  const prev = cursor > 0 ? trace.steps[cursor - 1] : undefined;
  const isExceptionStep =
    step?.event === 'exception' ||
    (trace.result.verdict === 'error' && cursor === trace.result.divergenceStepIndex);

  return (
    <div className="run-page">
      <header className="run-header">
        <Link to="/" className="back-link">
          ← edit code
        </Link>
        <VerdictBanner />
        <button
          className="code-toggle"
          onClick={() => setShowCode((v) => !v)}
          aria-pressed={showCode}
        >
          {showCode ? 'hide code' : 'show code'}
        </button>
      </header>

      {step ? (
        <main className={`run-main${showCode ? '' : ' no-code'}`}>
          {showCode && (
            <CodePanel code={trace.code} activeLine={step.line} isException={isExceptionStep} />
          )}
          <div className="stage-wrap">
            <div className="stage-scroll">
              <Stage step={step} prev={prev} shapes={shapes} />
            </div>
            <div className="stage-dock">
              {caption && (
                <div className={`ai-caption${caption.stepIndex === cursor ? ' fresh' : ''}`}>
                  <span className="explain-label">AI</span> {caption.text}
                </div>
              )}
              {step.event === 'return' && (
                <div className="return-note">
                  returns <code>{JSON.stringify(step.returnValue ?? null)}</code>
                </div>
              )}
              {step.exception && (
                <div className="exception-note">
                  {step.exception.type}: {step.exception.message}
                </div>
              )}
              {step.stdout && (
                <details className="stdout-strip" open={false}>
                  <summary>stdout</summary>
                  <pre>{step.stdout}</pre>
                </details>
              )}
              <ExplainPanel />
            </div>
          </div>
        </main>
      ) : (
        <main className="run-main no-code">
          <div className="empty-note big">
            No steps were recorded — {trace.result.message ?? 'the run produced no trace'}.
          </div>
        </main>
      )}

      <Transport />
    </div>
  );
}
