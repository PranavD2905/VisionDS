import type { JsonValue } from '@visionds/trace-schema';
import { ArrayScanFlat } from './ArrayScanDemo';
import { ScriptedScene, type ScriptFrame } from './ScriptedScene';

/**
 * The masthead exhibit: a bubble sort on the block rail. Heights encode value,
 * swaps arc on two lanes so the passing blocks miss each other, and `j` glides
 * along the comparison — the staircase assembling itself is the pitch.
 * Frames come from running the sort, one per comparison and one per swap.
 */
function bubbleFrames(input: number[]): ScriptFrame[] {
  const a = [...input];
  const frames: ScriptFrame[] = [];
  const push = (j: number, note: string) =>
    frames.push({
      scene: { kind: 'array', items: [...a] as JsonValue[], pointers: [{ name: 'j', index: j }] },
      readout: [['a[j] > a[j+1]', note]],
    });
  for (let end = a.length - 1; end > 0; end--) {
    for (let j = 0; j < end; j++) {
      const swap = a[j]! > a[j + 1]!;
      push(j, `${a[j]} > ${a[j + 1]} ${swap ? '· swap' : '· keep'}`);
      if (swap) {
        [a[j], a[j + 1]] = [a[j + 1]!, a[j]!];
        push(j, 'swapped');
      }
    }
  }
  frames.push({
    scene: { kind: 'array', items: [...a] as JsonValue[], pointers: [] },
    readout: [['sorted', 'return a']],
  });
  return frames;
}

const FRAMES = bubbleFrames([5, 2, 8, 1, 9, 3]);

export function BubbleSortDemo() {
  return (
    <ScriptedScene
      frames={FRAMES}
      height={300}
      interval={720}
      hold={4}
      fallback={
        <div className="masthead-demo-inner">
          <ArrayScanFlat />
        </div>
      }
    />
  );
}
