import type { TraceStep, VarSnapshot } from '@visionds/trace-schema';
import { LayoutGroup } from 'framer-motion';
import { viewRegistry } from './stage/views';

export function Stage({ step, prev }: { step: TraceStep; prev?: TraceStep }) {
  const prevByName = new Map<string, VarSnapshot>(
    (prev?.locals ?? []).map((v) => [v.name, v]),
  );
  const pointers = step.locals.filter((v) => v.role?.kind === 'index');
  const pointersFor = (target: string) =>
    pointers.filter((p) => p.role?.target === target);
  // pointer-role locals appear as chips riding their array, not as tiles
  const shown = step.locals.filter((v) => !v.role);

  return (
    <LayoutGroup>
      <div className="stage">
        {shown.map((snap) => {
          const View = viewRegistry[snap.kind];
          return (
            <View
              key={snap.name}
              snap={snap}
              prev={prevByName.get(snap.name)}
              pointers={pointersFor(snap.name)}
            />
          );
        })}
        {shown.length === 0 && <div className="empty-note">no variables yet</div>}
      </div>
    </LayoutGroup>
  );
}
