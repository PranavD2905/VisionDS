import type { JsonValue } from '@visionds/trace-schema';
import { ScriptedScene, type ScriptFrame } from './ScriptedScene';

/**
 * Two-sum's `seen` map filling on the keyed landing pads: each value → index
 * entry lands as a block dropping onto its key's pad, in insertion order.
 */
const NUMS = [2, 7, 11, 15];

function mapFrames(): ScriptFrame[] {
  const entries: [string, JsonValue][] = [];
  const frames: ScriptFrame[] = [{ scene: { kind: 'dict', entries: [] } }];
  NUMS.forEach((n, i) => {
    entries.push([String(n), i]);
    frames.push({
      scene: { kind: 'dict', entries: [...entries] },
      readout: [['seen[nums[i]]', `= ${i}`]],
    });
  });
  return frames;
}

const FRAMES = mapFrames();

export function MapDemo() {
  return <ScriptedScene frames={FRAMES} height={230} fallback={<MapFlat />} />;
}

/** The 2D exhibit, for reduced motion and machines without WebGL. */
function MapFlat() {
  const rows = [
    ['2', '0'],
    ['7', '1'],
    ['11', '2'],
  ];
  return (
    <div className="d-map">
      {rows.map(([k, v], i) => (
        <div className={`d-map-row d-map-${i}`} key={k}>
          <span className="d-map-key">{k}</span>
          <span className="d-map-arrow" aria-hidden="true">
            →
          </span>
          <span className="d-cell d-map-val">{v}</span>
        </div>
      ))}
    </div>
  );
}
