import type { CallTree } from '@visionds/trace-schema';

export interface CallTreeLayout {
  /** Pixel centre of each frame, indexed by node id. */
  pos: { x: number; y: number }[];
  width: number;
  height: number;
}

/**
 * Tidy layout of the *whole* call tree, computed once per trace.
 *
 * Positions are fixed up front on purpose: the view reveals frames as the
 * cursor reaches them, and a layout recomputed per step would slide every
 * already-drawn node sideways each time a sibling appeared. Laying out the
 * finished tree lets it draw itself into a stable shape instead.
 */
export function layoutCallTree(tree: CallTree, colW: number, rowH: number): CallTreeLayout {
  const x = new Array<number>(tree.nodes.length).fill(0);
  let leaf = 0;

  // iterative post-order: the recursion depth here would be the student's
  for (const root of tree.roots) {
    const stack: { id: number; expanded: boolean }[] = [{ id: root, expanded: false }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const kids = tree.nodes[frame.id]!.children;
      if (kids.length === 0) {
        x[frame.id] = leaf++;
        stack.pop();
      } else if (!frame.expanded) {
        frame.expanded = true;
        for (let i = kids.length - 1; i >= 0; i--) stack.push({ id: kids[i]!, expanded: false });
      } else {
        x[frame.id] = (x[kids[0]!]! + x[kids[kids.length - 1]!]!) / 2;
        stack.pop();
      }
    }
  }

  const pos = tree.nodes.map((n, i) => ({
    x: x[i]! * colW + colW / 2,
    y: n.depth * rowH + rowH / 2,
  }));

  return {
    pos,
    width: Math.max(leaf, 1) * colW,
    height: (tree.maxDepth + 1) * rowH,
  };
}
