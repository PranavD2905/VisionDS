import { aliasesOf, varKey, type TraceStep, type VarSnapshot } from '@visionds/trace-schema';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import type { StructShape } from '../lib/shapes';
import { Flat2D, shapeRegistry, viewRegistry, type ViewProps } from './stage/views';

type Group = 'primary' | 'structs' | 'scalars';

/**
 * One step on stage. Everything is per frame: `prev` is this frame's own
 * previous step (so entering a helper is not mistaken for every variable
 * changing), shapes are looked up by function + name, and while the step is
 * inside a helper the immediate caller's structures stay in view, dimmed and
 * flat, beneath the live frame. A caller value that is the same object as one
 * of this frame's (an alias, matched by `ref`) is shown once — live here —
 * with a link in the caller strip instead of a second copy.
 */
export function Stage({
  step,
  prev,
  shapes,
}: {
  step: TraceStep;
  prev?: TraceStep;
  shapes: Map<string, StructShape>;
}) {
  const prevByName = new Map<string, VarSnapshot>(
    (prev?.locals ?? []).map((v) => [v.name, v]),
  );
  const byName = new Map(step.locals.map((v) => [v.name, v]));
  const pointers = step.locals.filter((v) => v.role?.kind === 'index');
  const pointersFor = (target: string) =>
    pointers.filter((p) => p.role?.target === target);
  const shapeOf = (func: string | undefined, snap: VarSnapshot) =>
    snap.kind === 'array' ? shapes.get(varKey(func, snap.name)) : undefined;

  // Pointer-role locals ride their target as chips instead of appearing as
  // tiles — but only when the target's view can actually show them.
  const displaysPointers = (p: VarSnapshot) => {
    const target = p.role && byName.get(p.role.target);
    return !!target && target.kind !== 'matrix';
  };
  const shown = step.locals.filter((v) => !v.role || !displaysPointers(v));

  const groupOf = (v: VarSnapshot): Group => {
    if (v.kind === 'scalar' || v.role) return 'scalars';
    if (shapeOf(step.func, v) || v.kind === 'dict' || v.kind === 'set') return 'structs';
    return 'primary';
  };

  const render = (snap: VarSnapshot) => {
    const shape = shapeOf(step.func, snap);
    const View = shape ? shapeRegistry[shape] : viewRegistry[snap.kind];
    const props: ViewProps = {
      snap,
      prev: prevByName.get(snap.name),
      pointers: pointersFor(snap.name),
    };
    return <View key={snap.name} {...props} />;
  };

  const primary = shown.filter((v) => groupOf(v) === 'primary');
  const structs = shown.filter((v) => groupOf(v) === 'structs');
  const scalars = shown.filter((v) => groupOf(v) === 'scalars');

  const caller = step.caller;
  const aliases = aliasesOf(step);
  const renderCaller = (snap: VarSnapshot) => {
    const alias = aliases.get(snap.name);
    if (alias) {
      return (
        <div key={snap.name} className="alias-chip" title={`the same object as ${alias} here`}>
          <code>{snap.name}</code>
          <span aria-hidden="true"> ↗ </span>
          <code>{alias}</code>
        </div>
      );
    }
    const shape = shapeOf(caller?.func, snap);
    const View = shape ? shapeRegistry[shape] : viewRegistry[snap.kind];
    return <View key={snap.name} snap={snap} pointers={[]} />;
  };

  return (
    <LayoutGroup>
      <div className="stage">
        {primary.length > 0 && (
          <div className="stage-primary">
            <AnimatePresence mode="popLayout">{primary.map(render)}</AnimatePresence>
          </div>
        )}
        {structs.length > 0 && (
          <div className="stage-structs">
            <AnimatePresence mode="popLayout">{structs.map(render)}</AnimatePresence>
          </div>
        )}
        {scalars.length > 0 && (
          <div className="stage-scalars">
            <AnimatePresence mode="popLayout">{scalars.map(render)}</AnimatePresence>
          </div>
        )}
        {shown.length === 0 && (
          <div className="empty-note stage-empty">no locals yet — step forward to watch them appear</div>
        )}
        {caller && caller.locals.length > 0 && (
          // its own layout namespace: the caller's `nums` and a helper's
          // `nums` must never glide into each other
          <LayoutGroup id="caller">
            <section className="stage-caller" aria-label={`In the caller, ${caller.func}`}>
              <span className="stage-caller-tag">in {caller.func}()</span>
              <Flat2D>
                <div className="stage-caller-items">{caller.locals.map(renderCaller)}</div>
              </Flat2D>
            </section>
          </LayoutGroup>
        )}
      </div>
    </LayoutGroup>
  );
}
