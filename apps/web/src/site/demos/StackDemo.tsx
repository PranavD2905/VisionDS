import { ScriptedScene, type ScriptFrame } from './ScriptedScene';

/**
 * Bracket matching on the stack tower: openers drop in from above, matching
 * closers pop them off, and the `top` tag rides the summit throughout.
 */
const INPUT = '([{}])';
const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function stackFrames(): ScriptFrame[] {
  const stack: string[] = [];
  const frames: ScriptFrame[] = [
    { scene: { kind: 'stack', items: [], pointers: [] }, readout: [['ch', '—']] },
  ];
  for (const ch of INPUT) {
    if (PAIRS[ch]) stack.pop();
    else stack.push(ch);
    frames.push({
      scene: { kind: 'stack', items: [...stack], pointers: [] },
      readout: [['ch', ch]],
    });
  }
  return frames;
}

const FRAMES = stackFrames();

export function StackDemo() {
  return <ScriptedScene frames={FRAMES} height={230} fallback={<StackFlat />} />;
}

/** The 2D exhibit, for reduced motion and machines without WebGL. */
function StackFlat() {
  return (
    <div className="d-stack">
      <span className="d-stack-top">TOP</span>
      <div className="d-stack-col">
        {['(', '[', '{'].map((v, i) => (
          <span className={`d-cell d-stack-cell d-stack-${i}`} key={i}>
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}
