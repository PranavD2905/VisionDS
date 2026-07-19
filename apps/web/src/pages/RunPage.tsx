import { Link, Navigate } from 'react-router-dom';
import { CodePanel } from '../components/CodePanel';
import { ExplainPanel } from '../components/ExplainPanel';
import { Stage } from '../components/Stage';
import { Transport } from '../components/Transport';
import { VerdictBanner } from '../components/VerdictBanner';
import { useActiveTrace, useVis } from '../store';

export function RunPage() {
  const trace = useActiveTrace();
  const cursor = useVis((s) => s.cursor);
  const explanation = useVis((s) => s.explanation);

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
      </header>

      {step ? (
        <main className="run-main">
          <CodePanel code={trace.code} activeLine={step.line} isException={isExceptionStep} />
          <div className="stage-wrap">
            <ExplainPanel />
            {caption && (
              <div className={`ai-caption${caption.stepIndex === cursor ? ' fresh' : ''}`}>
                <span className="explain-label">AI</span> {caption.text}
              </div>
            )}
            <Stage step={step} prev={prev} />
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
          </div>
        </main>
      ) : (
        <main className="run-main">
          <div className="empty-note big">
            No steps were recorded — {trace.result.message ?? 'the run produced no trace'}.
          </div>
        </main>
      )}

      <Transport />
    </div>
  );
}
