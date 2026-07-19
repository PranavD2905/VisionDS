import type { JsonValue, VarKind, VarSnapshot } from '@visionds/trace-schema';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { FC } from 'react';
import { fmt } from '../../lib/format';

export interface ViewProps {
  snap: VarSnapshot;
  /** Same variable one step earlier, for change pulses. */
  prev?: VarSnapshot;
  /** Index-role locals targeting this variable (arrays only). */
  pointers: VarSnapshot[];
}

const spring = { type: 'spring', stiffness: 500, damping: 32 } as const;

/** Re-mounts on value change so `initial` plays as a pulse. */
function Pulse({ value, className }: { value: JsonValue; className: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      key={fmt(value)}
      className={className}
      initial={reduced ? false : { scale: 1.25, backgroundColor: 'var(--pulse)' }}
      animate={{ scale: 1, backgroundColor: 'var(--cell-bg)' }}
      transition={{ duration: 0.35 }}
    >
      {fmt(value)}
    </motion.span>
  );
}

const PointerChip: FC<{ name: string }> = ({ name }) => (
  <motion.div layoutId={`ptr-${name}`} layout transition={spring} className="pointer-chip">
    {name}
  </motion.div>
);

const ArrayView: FC<ViewProps> = ({ snap, pointers }) => {
  const items = Array.isArray(snap.value) ? snap.value : [];
  const chipFor = (i: number) =>
    pointers.filter((p) => typeof p.value === 'number' && p.value === i);
  return (
    <div className="var-block">
      <div className="var-name">
        {snap.name}
        {snap.truncated && <span className="truncated-mark" title="value truncated">…</span>}
      </div>
      <div className="array-row">
        {items.map((v, i) => (
          <div className="array-col" key={i}>
            <div className="chip-slot">
              {chipFor(i).map((p) => (
                <PointerChip key={p.name} name={p.name} />
              ))}
            </div>
            <Pulse value={v} className="cell" />
            <div className="index-label">{i}</div>
          </div>
        ))}
        {items.length === 0 && <div className="empty-note">empty</div>}
      </div>
    </div>
  );
};

const MatrixView: FC<ViewProps> = ({ snap }) => {
  const rows = Array.isArray(snap.value) ? snap.value : [];
  return (
    <div className="var-block">
      <div className="var-name">{snap.name}</div>
      <div className="matrix">
        {rows.map((row, r) => (
          <div className="array-row" key={r}>
            {(Array.isArray(row) ? row : [row]).map((v, c) => (
              <Pulse key={c} value={v} className="cell" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

const DictView: FC<ViewProps> = ({ snap }) => {
  const entries =
    snap.value && typeof snap.value === 'object' && !Array.isArray(snap.value)
      ? Object.entries(snap.value)
      : [];
  return (
    <div className="var-block">
      <div className="var-name">{snap.name}</div>
      <div className="chip-row">
        <AnimatePresence initial={false}>
          {entries.map(([k, v]) => (
            <motion.div
              key={k}
              className="kv-chip"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring}
              layout
            >
              <span className="kv-key">{k}</span>
              <Pulse value={v} className="kv-val" />
            </motion.div>
          ))}
        </AnimatePresence>
        {entries.length === 0 && <div className="empty-note">empty</div>}
      </div>
    </div>
  );
};

const SetView: FC<ViewProps> = ({ snap }) => {
  const items = Array.isArray(snap.value) ? snap.value : [];
  return (
    <div className="var-block">
      <div className="var-name">{snap.name}</div>
      <div className="chip-row">
        <AnimatePresence initial={false}>
          {items.map((v) => (
            <motion.div
              key={fmt(v)}
              className="kv-chip"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring}
              layout
            >
              <span className="kv-val">{fmt(v)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && <div className="empty-note">empty</div>}
      </div>
    </div>
  );
};

const ScalarView: FC<ViewProps> = ({ snap }) => (
  <div className="var-block scalar">
    <div className="var-name">{snap.name}</div>
    <Pulse value={snap.value} className="scalar-tile" />
  </div>
);

/** kind → component; new kinds (future languages) are additive entries. */
export const viewRegistry: Record<VarKind, FC<ViewProps>> = {
  array: ArrayView,
  matrix: MatrixView,
  dict: DictView,
  set: SetView,
  string: ScalarView,
  scalar: ScalarView,
};
