import type { JsonValue, TraceStep, VarSnapshot } from './schema';

/**
 * The call tree, derived from a trace — never recorded separately.
 *
 * The trace is ground truth (see CLAUDE.md): every frame here comes from a
 * real `call`/`return` event, or, for runners that only emit `line` events
 * (the C++/Java steppers), from an observed change in `callDepth`. Nothing is
 * inferred about calls that were not actually executed.
 */
export interface CallNode {
  id: number;
  /** Function name; a positional label when the runner recorded none. */
  func: string;
  /** Frames above this one on the stack, 0 for the entry call. */
  depth: number;
  /** Step index where the frame was entered — what a click seeks to. */
  enterStep: number;
  /** Step index where it left the stack; absent if the trace was cut short. */
  exitStep?: number;
  /** Locals at the moment of entry — i.e. the arguments. */
  args: VarSnapshot[];
  returnValue?: JsonValue;
  /** True once the frame left the stack, whether or not a value was recorded. */
  returned: boolean;
  exception?: { type: string; message: string };
  parent: number | null;
  children: number[];
}

export interface CallTree {
  /** Every frame, in call order — `id` is the index into this array. */
  nodes: CallNode[];
  roots: number[];
  /** Functions observed calling themselves, directly or mutually. */
  recursive: string[];
  maxDepth: number;
  /** True when the node cap cut the tree short. */
  truncated: boolean;
}

/**
 * Frames past this are dropped. A 10k-step trace can hold far more calls than
 * anyone can read, and the tree is a comprehension aid, not a log.
 */
export const MAX_CALL_NODES = 1200;

export function buildCallTree(steps: TraceStep[]): CallTree {
  const nodes: CallNode[] = [];
  const roots: number[] = [];
  const stack: CallNode[] = [];
  let truncated = false;

  const open = (step: TraceStep, at: number) => {
    const depth = stack.length;
    const parent = depth > 0 ? stack[depth - 1]! : null;
    const node: CallNode = {
      id: nodes.length,
      func: step.func || (parent === null ? 'entry' : `frame ${depth}`),
      depth,
      enterStep: at,
      args: step.locals,
      returned: false,
      parent: parent === null ? null : parent.id,
      children: [],
    };
    nodes.push(node);
    if (parent === null) roots.push(node.id);
    else parent.children.push(node.id);
    stack.push(node);
  };

  const close = (at: number, step?: TraceStep) => {
    const node = stack.pop();
    if (!node) return;
    node.exitStep = at;
    node.returned = true;
    if (step) node.returnValue = step.returnValue;
  };

  // Python's tracer emits real call/return events; the debugger-backed
  // steppers only emit `line`, so their frames are read off callDepth.
  const hasCallEvents = steps.some((s) => s.event === 'call');

  outer: for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const top = () => stack[stack.length - 1];
    if (hasCallEvents) {
      if (step.event === 'call') {
        if (nodes.length >= MAX_CALL_NODES) {
          truncated = true;
          break outer;
        }
        open(step, i);
      } else if (step.event === 'return') {
        close(i, step);
      } else if (step.event === 'exception') {
        const frame = top();
        if (frame) frame.exception = step.exception;
      }
    } else {
      const want = step.callDepth + 1;
      const prev = Math.max(i - 1, 0);
      while (stack.length > want) close(prev);
      // same depth but a different function: a sibling call, not the same frame
      const frame = top();
      if (stack.length === want && step.func && frame && frame.func !== step.func) {
        close(prev);
      }
      while (stack.length < want) {
        if (nodes.length >= MAX_CALL_NODES) {
          truncated = true;
          break outer;
        }
        open(step, i);
      }
      const live = top();
      if (step.exception && live) live.exception = step.exception;
    }
  }
  // frames still open at the end never returned (truncation, timeout, throw)

  const recursive = new Set<string>();
  for (const node of nodes) {
    const path: string[] = [node.func];
    for (let p = node.parent; p !== null; p = nodes[p]!.parent) {
      const ancestor = nodes[p]!;
      path.push(ancestor.func);
      if (ancestor.func === node.func) {
        for (const f of path) recursive.add(f); // covers mutual recursion too
        break;
      }
    }
  }

  return {
    nodes,
    roots,
    recursive: [...recursive],
    maxDepth: nodes.reduce((m, n) => Math.max(m, n.depth), 0),
    truncated,
  };
}

/** True when the frame is on the stack at `cursor` (entered, not yet gone). */
export function isOpenAt(node: CallNode, cursor: number): boolean {
  return node.enterStep <= cursor && (node.exitStep === undefined || cursor < node.exitStep);
}
