import { buildCallTree, type ExecutionTrace } from '@visionds/trace-schema';
import { useEffect, useMemo, useState } from 'react';
import { CallTreeView } from '../components/CallTreeView';
import { ExplainPanel } from '../components/ExplainPanel';
import { Stage } from '../components/Stage';
import { Transport } from '../components/Transport';
import { VerdictBanner } from '../components/VerdictBanner';
import { inferShapes, type StructShape } from '../lib/shapes';
import { useVis } from '../store';

/**
 * The output half of the workbench: verdict, diagrams, narration, transport.
 *
 * Reads playback state from the store rather than taking it as props, so the
 * source pane and this one stay independent — neither re-renders the other.
 */
export function StagePane({ trace }: { trace: ExecutionTrace | undefined }) {
  const cursor = useVis((s) => s.cursor);
  const explanation = useVis((s) => s.explanation);
  const [view, setView] = useState<'stage' | 'calls'>('stage');

  // behavior-inferred structure shapes (stack/queue), computed once per trace
  const shapes = useMemo<Map<string, StructShape>>(
    () => (trace ? inferShapes(trace) : new Map()),
    [trace],
  );

  // The call tree is derived, not recorded — one pass over the finished trace.
  // Recursion is what makes it worth showing, so it gates the toggle.
  const callTree = useMemo(() => (trace ? buildCallTree(trace.steps) : null), [trace]);
  const recursive = callTree?.recursive ?? [];
  const hasRecursion = recursive.length > 0;

  // a non-recursive run has no recursion tab to fall back from
  useEffect(() => {
    if (!hasRecursion) setView('stage');
  }, [hasRecursion]);

  // subtitle-style narration: latest AI caption at or before the cursor
  const caption = explanation?.annotations.filter((a) => a.stepIndex <= cursor).at(-1);

  if (!trace) {
    return (
      <section className="pane pane-stage frame" aria-label="Visualization">
        <header className="pane-head">
          <span className="pane-title">Stage</span>
        </header>
        <div className="stage-empty-state">
          <img className="empty-mark" src="/logo.svg" alt="" aria-hidden="true" />
          <p className="empty-lead">Nothing recorded yet</p>
          <p className="empty-sub">
            Run your code and every structure it touches gets drawn here, step by step.
          </p>
        </div>
      </section>
    );
  }

  const step = trace.steps[cursor];
  const prev = cursor > 0 ? trace.steps[cursor - 1] : undefined;

  return (
    <section className="pane pane-stage frame" aria-label="Visualization">
      <header className="pane-head pane-head-verdict">
        <VerdictBanner />
        {hasRecursion && (
          <div className="view-tabs" role="tablist" aria-label="Stage view">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'stage'}
              className={`view-tab${view === 'stage' ? ' active' : ''}`}
              onClick={() => setView('stage')}
            >
              Structures
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'calls'}
              className={`view-tab${view === 'calls' ? ' active' : ''}`}
              onClick={() => setView('calls')}
              title={`recursive: ${recursive.join(', ')}`}
            >
              Recursion tree
            </button>
          </div>
        )}
      </header>

      {step ? (
        <>
          {view === 'calls' && callTree ? (
            <CallTreeView tree={callTree} />
          ) : (
            <div className="stage-scroll">
              <Stage step={step} prev={prev} shapes={shapes} />
            </div>
          )}
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
              <details className="stdout-strip">
                <summary>stdout</summary>
                <pre>{step.stdout}</pre>
              </details>
            )}
            <ExplainPanel />
          </div>
        </>
      ) : (
        <div className="stage-empty-state">
          <p className="empty-lead">No steps were recorded</p>
          <p className="empty-sub">{trace.result.message ?? 'the run produced no trace'}</p>
        </div>
      )}

      <Transport />
    </section>
  );
}
