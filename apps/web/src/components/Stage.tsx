import type { TraceStep, VarSnapshot } from '@visionds/trace-schema';
import { AnimatePresence, LayoutGroup } from 'framer-motion';
import type { StructShape } from '../lib/shapes';
import { shapeRegistry, viewRegistry, type ViewProps } from './stage/views';

type Group = 'primary' | 'structs' | 'scalars';

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

  // Pointer-role locals ride their target as chips instead of appearing as
  // tiles — but only when the target's view can actually show them.
  const displaysPointers = (p: VarSnapshot) => {
    const target = p.role && byName.get(p.role.target);
    return !!target && target.kind !== 'matrix';
  };
  const shown = step.locals.filter((v) => !v.role || !displaysPointers(v));

  const groupOf = (v: VarSnapshot): Group => {
    if (v.kind === 'scalar' || v.role) return 'scalars';
    if (shapes.has(v.name) || v.kind === 'dict' || v.kind === 'set') return 'structs';
    return 'primary';
  };

  const render = (snap: VarSnapshot) => {
    const shape = snap.kind === 'array' ? shapes.get(snap.name) : undefined;
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
      </div>
    </LayoutGroup>
  );
}
