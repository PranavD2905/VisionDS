/**
 * STAGE3D — the lazy chunk's entry: one canvas + the scene for a structure
 * kind. three.js and every scene live behind this import, so nothing 3D
 * loads until an eligible structure is actually on stage.
 *
 * Each kind gets its own camera rig: rails are viewed low and shallow,
 * fields and keyed scenes from higher up (their meaning spreads in z),
 * trees from further back (their meaning stacks in y).
 */
import type { JsonValue } from '@visionds/trace-schema';
import type { TreeValue } from '../treeLayout';
import { MatrixScene } from './field';
import { StageCanvas } from './kit';
import { DictScene, SetScene } from './keyed';
import { ArrayScene, QueueScene, StackScene, type Chip } from './linear';
import { ListScene, TreeScene } from './graph';

export type Stage3DProps = { width: number; height: number } & (
  | { kind: 'array'; items: JsonValue[]; pointers: Chip[]; raw?: boolean }
  | { kind: 'stack'; items: JsonValue[]; pointers: Chip[] }
  | { kind: 'queue'; items: JsonValue[]; pointers: Chip[] }
  | { kind: 'matrix'; rows: number[][] }
  | { kind: 'dict'; entries: [string, JsonValue][] }
  | { kind: 'set'; items: JsonValue[] }
  | { kind: 'linkedlist'; vals: JsonValue[]; cyclesTo: number | null }
  | { kind: 'tree'; root: TreeValue | null }
);

type Rig = { camera: [number, number, number]; look: [number, number, number] };
const rigs: Record<Stage3DProps['kind'], Rig> = {
  array: { camera: [0, 4.4, 10.4], look: [0, 0.9, 0] },
  stack: { camera: [0, 4.6, 10.8], look: [0, 1.3, 0] },
  queue: { camera: [0, 4.4, 10.4], look: [0, 0.8, 0] },
  matrix: { camera: [0, 8.2, 10.2], look: [0, -0.1, 0] },
  dict: { camera: [0, 6.6, 10.6], look: [0, 0.4, 0] },
  set: { camera: [0, 6.6, 10.6], look: [0, 0.3, 0] },
  linkedlist: { camera: [0, 4.4, 10.4], look: [0, 0.9, 0] },
  tree: { camera: [0, 4.6, 12.4], look: [0, 1.7, 0] },
};

export default function Stage3D(props: Stage3DProps) {
  const rig = rigs[props.kind];
  let scene;
  switch (props.kind) {
    case 'array':
      scene = <ArrayScene items={props.items} pointers={props.pointers} raw={props.raw} />;
      break;
    case 'stack':
      scene = <StackScene items={props.items} pointers={props.pointers} />;
      break;
    case 'queue':
      scene = <QueueScene items={props.items} pointers={props.pointers} />;
      break;
    case 'matrix':
      scene = <MatrixScene rows={props.rows} />;
      break;
    case 'dict':
      scene = <DictScene entries={props.entries} />;
      break;
    case 'set':
      scene = <SetScene items={props.items} />;
      break;
    case 'linkedlist':
      scene = <ListScene vals={props.vals} cyclesTo={props.cyclesTo} />;
      break;
    case 'tree':
      scene = <TreeScene root={props.root} />;
      break;
  }
  return (
    <StageCanvas width={props.width} height={props.height} camera={rig.camera} look={rig.look}>
      {scene}
    </StageCanvas>
  );
}
