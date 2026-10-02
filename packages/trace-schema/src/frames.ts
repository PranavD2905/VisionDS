import type { TraceStep, VarSnapshot } from './schema';

/**
 * Frame-aware identity for a variable, by function: `i` in `main` and `i` in
 * a helper are different variables, while `i` across every recursive call of
 * one function is the same *kind* of variable (so evidence about it — is it a
 * pointer, is that list a stack — pools across activations). Steps without a
 * `func` (older traces) share one namespace, as before.
 */
export function varKey(func: string | undefined, name: string): string {
  return `${func ?? ''}::${name}`;
}

/**
 * The step to diff `steps[cursor]` against: the latest earlier step in the
 * *same frame activation*. Diffing against the literal previous step made
 * entering or leaving a helper look as if every variable had changed. Falls
 * back to the previous step for traces without frame ids, and to none when
 * this is the frame's first step.
 */
export function previousInFrame(steps: TraceStep[], cursor: number): TraceStep | undefined {
  const step = steps[cursor];
  if (!step || cursor === 0) return undefined;
  if (step.frameId === undefined) return steps[cursor - 1];
  for (let i = cursor - 1; i >= 0; i--) {
    if (steps[i]!.frameId === step.frameId) return steps[i];
  }
  return undefined;
}

/**
 * The caller's locals that are the same object as one of this frame's
 * (matched by `ref`), mapped to the name this frame knows it by — the array
 * passed into a helper as `arr` is the caller's `nums`, not a copy.
 */
export function aliasesOf(step: TraceStep): Map<string, string> {
  const out = new Map<string, string>();
  if (!step.caller) return out;
  const byRef = new Map<string, VarSnapshot>();
  for (const v of step.locals) if (v.ref) byRef.set(v.ref, v);
  for (const v of step.caller.locals) {
    const mine = v.ref ? byRef.get(v.ref) : undefined;
    if (mine) out.set(v.name, mine.name);
  }
  return out;
}
