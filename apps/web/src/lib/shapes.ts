import type { ExecutionTrace, JsonValue } from '@visionds/trace-schema';

/**
 * Behavioral shape of an array-kind local, inferred from how it actually
 * mutated across the recorded trace — never from the name alone. The trace
 * is ground truth: a list only becomes a "stack" on stage if it was only
 * ever pushed/popped at the back, a "queue" if items left from the front.
 */
export type StructShape = 'stack' | 'queue';

function sig(v: JsonValue): string {
  return JSON.stringify(v);
}

function eqArr(a: JsonValue[], b: JsonValue[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (sig(a[i] ?? null) !== sig(b[i] ?? null)) return false;
  }
  return true;
}

interface Evidence {
  pushBack: number;
  popBack: number;
  pushFront: number;
  popFront: number;
  /** random-access writes or unexplained diffs — disqualifies stack/queue */
  other: number;
}

export function inferShapes(trace: ExecutionTrace): Map<string, StructShape> {
  const ev = new Map<string, Evidence>();
  const last = new Map<string, JsonValue[]>();

  for (const step of trace.steps) {
    for (const v of step.locals) {
      if (v.kind !== 'array' || !Array.isArray(v.value)) continue;
      const prev = last.get(v.name);
      const cur = v.value;
      if (prev) {
        let e = ev.get(v.name);
        if (!e) ev.set(v.name, (e = { pushBack: 0, popBack: 0, pushFront: 0, popFront: 0, other: 0 }));
        const d = cur.length - prev.length;
        if (d === 1) {
          const back = eqArr(cur.slice(0, -1), prev);
          const front = eqArr(cur.slice(1), prev);
          if (back && !front) e.pushBack++;
          else if (front && !back) e.pushFront++;
          else if (!back && !front) e.other++;
          // both match (e.g. all-equal elements): ambiguous, no evidence
        } else if (d === -1) {
          const back = eqArr(cur, prev.slice(0, -1));
          const front = eqArr(cur, prev.slice(1));
          if (back && !front) e.popBack++;
          else if (front && !back) e.popFront++;
          else if (!back && !front) e.other++;
        } else if (d === 0 && !eqArr(cur, prev)) {
          e.other++;
        }
        // |d| > 1: reassignment/rebuild — carries no push/pop evidence
      }
      last.set(v.name, cur);
    }
  }

  const shapes = new Map<string, StructShape>();
  for (const [name, e] of ev) {
    if (e.other > 0) continue;
    if (e.popFront > 0) {
      shapes.set(name, 'queue'); // FIFO exit observed (deque counts as queue)
    } else if (e.popBack > 0 && e.pushFront === 0) {
      shapes.set(name, 'stack');
    } else if (e.pushFront > 0) {
      shapes.set(name, 'queue');
    } else if (e.pushBack > 0) {
      // grow-only: fall back to declared intent in the name
      if (/stack|stk/i.test(name)) shapes.set(name, 'stack');
      else if (/queue|deque|^dq$|^q\d?$/i.test(name)) shapes.set(name, 'queue');
    }
  }
  return shapes;
}
