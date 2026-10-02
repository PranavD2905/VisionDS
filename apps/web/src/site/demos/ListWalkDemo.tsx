import { ScriptedScene, type ScriptFrame } from './ScriptedScene';

/**
 * A linked list growing node by node on the chain, terminating in null —
 * until the tail's `next` is pointed back into the list and the cycle tube
 * arcs over to the node it returns to.
 */
const VALS = [3, 1, 4, 5];
const CYCLE_TO = 1;

const FRAMES: ScriptFrame[] = [
  ...VALS.map((_, i) => ({
    scene: { kind: 'linkedlist' as const, vals: VALS.slice(0, i + 1), cyclesTo: null },
    readout: [['tail.next', 'None']] as Array<[string, string]>,
  })),
  {
    scene: { kind: 'linkedlist', vals: VALS, cyclesTo: CYCLE_TO },
    readout: [['tail.next', `node ${VALS[CYCLE_TO]}`]],
  },
];

export function ListWalkDemo() {
  return <ScriptedScene frames={FRAMES} height={230} hold={3} fallback={<ListWalkFlat />} />;
}

/** The 2D exhibit, for reduced motion and machines without WebGL. */
function ListWalkFlat() {
  return (
    <div className="d-list">
      <span className="d-ptr d-ptr-curr">curr</span>
      {[3, 1, 4].map((v, i) => (
        <span className="d-list-node" key={i}>
          <span className="d-cell">{v}</span>
          <span className="d-list-arrow" aria-hidden="true">
            →
          </span>
        </span>
      ))}
      <span className="d-null">∅</span>
    </div>
  );
}
