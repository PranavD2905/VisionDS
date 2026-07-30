import type { JsonValue } from '@visionds/trace-schema';

/** The nested shape the tracers emit for TreeNode-kind locals. */
export interface TreeValue {
  val: JsonValue;
  left: TreeValue | null;
  right: TreeValue | null;
}

export interface TreeNodeLayout {
  id: number;
  val: JsonValue;
  col: number;
  depth: number;
}

export interface TreeEdge {
  from: number;
  to: number;
}

/** In-order column assignment (classic non-overlapping binary layout).
 *  Shared by the 2D TreeView and the 3D TreeScene so both agree on shape. */
export function layoutTree(root: TreeValue | null) {
  const nodes: TreeNodeLayout[] = [];
  const edges: TreeEdge[] = [];
  let col = 0;
  let id = 0;
  let maxDepth = 0;
  const visit = (node: TreeValue | null, depth: number): number | null => {
    if (!node || typeof node !== 'object') return null;
    const leftId = visit(node.left, depth + 1);
    const myId = id++;
    nodes.push({ id: myId, val: node.val, col: col++, depth });
    maxDepth = Math.max(maxDepth, depth);
    if (leftId !== null) edges.push({ from: myId, to: leftId });
    const rightId = visit(node.right, depth + 1);
    if (rightId !== null) edges.push({ from: myId, to: rightId });
    return myId;
  };
  visit(root, 0);
  return { nodes, edges, cols: col, depth: maxDepth };
}
