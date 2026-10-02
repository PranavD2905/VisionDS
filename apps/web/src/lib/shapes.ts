import { varKey, type ExecutionTrace, type JsonValue } from '@visionds/trace-schema';

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

/**
 * Shapes keyed by `varKey(func, name)`. Each value is diffed only against the
 * same variable in the *same frame*: comparing a helper's `path` with the
 * caller's `path` (or one recursion level's with the next) invented pushes
 * and pops that never happened. Evidence then pools per function, so a
 * stack built across recursive calls is still recognised.
 */
export function inferShapes(trace: ExecutionTrace): Map<string, StructShape> {
  const ev = new Map<string, Evidence>();
  const last = new Map<string, JsonValue[]>();

  for (const step of trace.steps) {
    for (const v of step.locals) {
      if (v.kind !== 'array' || !Array.isArray(v.value)) continue;
      const key = varKey(step.func, v.name);
      const inFrame = `${step.frameId ?? ''}|${key}`;
      const prev = last.get(inFrame);
      const cur = v.value;
      if (prev) {
        let e = ev.get(key);
        if (!e) ev.set(key, (e = { pushBack: 0, popBack: 0, pushFront: 0, popFront: 0, other: 0 }));
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
      last.set(inFrame, cur);
    }
  }

  const shapes = new Map<string, StructShape>();
  for (const [key, e] of ev) {
    const name = key.slice(key.indexOf('::') + 2);
    if (e.other > 0) continue;
    if (e.popFront > 0) {
      shapes.set(key, 'queue'); // FIFO exit observed (deque counts as queue)
    } else if (e.popBack > 0 && e.pushFront === 0) {
      shapes.set(key, 'stack');
    } else if (e.pushFront > 0) {
      shapes.set(key, 'queue');
    } else if (e.pushBack > 0) {
      // grow-only: fall back to declared intent in the name
      if (/stack|stk/i.test(name)) shapes.set(key, 'stack');
      else if (/queue|deque|^dq$|^q\d?$/i.test(name)) shapes.set(key, 'queue');
    }
  }
  return shapes;
}
