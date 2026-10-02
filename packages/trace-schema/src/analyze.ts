import { varKey } from './frames';
import type { ExecutionTrace, TraceStep, VarSnapshot } from './schema';

const POINTER_NAMES = new Set([
  'i', 'j', 'k', 'l', 'r', 'lo', 'hi', 'left', 'right', 'mid', 'low', 'high',
  'start', 'end', 'p', 'q', 'fast', 'slow', 'idx', 'index', 'pos',
]);

interface Candidate {
  /** steps where both the int and the array exist */
  cooccurrences: number;
  inBoundsEverywhere: boolean;
}

/**
 * Language-agnostic post-processing: an integer local whose value stays
 * within [-1, len] of some array-, matrix-, or string-kind local across every step where both
 * exist is tagged with role {kind:'index', target}, so the UI can render it
 * as a pointer chip riding on that array. Returns a new trace; the input is
 * not mutated.
 *
 * Variables are identified per function (`varKey`), never by name alone: an
 * `i` in the entry and an `i` in a helper are inferred separately, so one
 * can't steal the other's target or fail the other's bounds check.
 */
export function inferPointerRoles(trace: ExecutionTrace): ExecutionTrace {
  const intKeys = new Map<string, string>(); // key → bare name
  const notInt = new Set<string>();
  const intValues = new Map<string, Set<number>>();
  const arrayKeys = new Set<string>();

  for (const step of trace.steps) {
    for (const v of step.locals) {
      const key = varKey(step.func, v.name);
      if (v.kind === 'array' || v.kind === 'matrix' || v.kind === 'string') {
        arrayKeys.add(key);
      }
      if (v.kind === 'scalar' && typeof v.value === 'number' && Number.isInteger(v.value)) {
        intKeys.set(key, v.name);
        let set = intValues.get(key);
        if (!set) intValues.set(key, (set = new Set()));
        set.add(v.value);
      } else {
        // took a non-integer value at some step — not an index
        notInt.add(key);
      }
    }
  }

  const roles = new Map<string, string>();
  for (const [key, name] of intKeys) {
    if (notInt.has(key) || arrayKeys.has(key)) continue;
    const varies = (intValues.get(key)?.size ?? 0) >= 2;
    if (!varies && !POINTER_NAMES.has(name)) continue;

    const candidates = new Map<string, Candidate>();
    for (const step of trace.steps) {
      if (varKey(step.func, name) !== key) continue;
      const me = step.locals.find((v) => v.name === name);
      if (!me || typeof me.value !== 'number') continue;
      for (const arr of step.locals) {
        if (!arrayKeys.has(varKey(step.func, arr.name))) continue;
        const len = Array.isArray(arr.value)
          ? arr.value.length
          : typeof arr.value === 'string'
            ? arr.value.length
            : undefined;
        if (len === undefined) continue;
        let c = candidates.get(arr.name);
        if (!c) candidates.set(arr.name, (c = { cooccurrences: 0, inBoundsEverywhere: true }));
        c.cooccurrences += 1;
        if (me.value < -1 || me.value > len) c.inBoundsEverywhere = false;
      }
    }

    let best: string | undefined;
    let bestCount = 0;
    for (const [arrName, c] of candidates) {
      if (!c.inBoundsEverywhere) continue;
      if (c.cooccurrences > bestCount) {
        best = arrName;
        bestCount = c.cooccurrences;
      }
    }
    if (best) roles.set(key, best);
  }

  if (roles.size === 0) return trace;

  const steps: TraceStep[] = trace.steps.map((step) => ({
    ...step,
    locals: step.locals.map((v): VarSnapshot => {
      const target = roles.get(varKey(step.func, v.name));
      return target ? { ...v, role: { kind: 'index', target } } : v;
    }),
  }));
  return { ...trace, steps };
}
