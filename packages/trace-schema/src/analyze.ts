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
 */
export function inferPointerRoles(trace: ExecutionTrace): ExecutionTrace {
  const intNames = new Set<string>();
  const intValues = new Map<string, Set<number>>();
  const arrayNames = new Set<string>();

  for (const step of trace.steps) {
    for (const v of step.locals) {
      if (v.kind === 'array' || v.kind === 'matrix' || v.kind === 'string') {
        arrayNames.add(v.name);
      }
      if (v.kind === 'scalar' && typeof v.value === 'number' && Number.isInteger(v.value)) {
        intNames.add(v.name);
        let set = intValues.get(v.name);
        if (!set) intValues.set(v.name, (set = new Set()));
        set.add(v.value);
      } else if (intNames.has(v.name)) {
        // took a non-integer value at some step — not an index
        intNames.delete(v.name);
      }
    }
  }

  const roles = new Map<string, string>();
  for (const name of intNames) {
    if (arrayNames.has(name)) continue;
    const varies = (intValues.get(name)?.size ?? 0) >= 2;
    if (!varies && !POINTER_NAMES.has(name)) continue;

    const candidates = new Map<string, Candidate>();
    for (const step of trace.steps) {
      const me = step.locals.find((v) => v.name === name);
      if (!me || typeof me.value !== 'number') continue;
      for (const arr of step.locals) {
        if (!arrayNames.has(arr.name)) continue;
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
    if (best) roles.set(name, best);
  }

  if (roles.size === 0) return trace;

  const steps: TraceStep[] = trace.steps.map((step) => ({
    ...step,
    locals: step.locals.map((v): VarSnapshot => {
      const target = roles.get(v.name);
      return target ? { ...v, role: { kind: 'index', target } } : v;
    }),
  }));
  return { ...trace, steps };
}
