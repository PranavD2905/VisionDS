import type { JsonValue, VarKind, VarSnapshot } from '@visionds/trace-schema';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Component, Suspense, lazy, useRef, type FC, type ReactNode } from 'react';
import { fmt } from '../../lib/format';
import { tokenAlpha } from '../../theme/tokens';
import { useSlotIds } from './slotIds';

/** The WebGL stage ships in its own chunk; three.js never loads until an
 *  eligible array is actually on stage. */
const Array3D = lazy(() => import('./Array3D'));

export interface ViewProps {
  snap: VarSnapshot;
  /** Same variable one step earlier, for change pulses. */
  prev?: VarSnapshot;
  /** Index-role locals targeting this variable. */
  pointers: VarSnapshot[];
}

const spring = { type: 'spring', stiffness: 480, damping: 34, mass: 0.9 } as const;
const drawEase = [0.16, 1, 0.3, 1] as const;

/**
 * Endpoints of the change-flash, resolved once from the semantic layer.
 * Cached because the stage re-renders on every step and the tokens are stable
 * for the lifetime of a theme.
 */
const flashCache = new Map<string, [string, string]>();
function flashColors(): [string, string] {
  const theme = document.documentElement.dataset.theme ?? 'specimen';
  let pair = flashCache.get(theme);
  if (!pair) {
    pair = [tokenAlpha('--accent', 0.4), tokenAlpha('--accent', 0)];
    flashCache.set(theme, pair);
  }
  return pair;
}

/**
 * Entrance stagger, scoped to the mount of the calling view. Cells that
 * exist when the structure first appears build in one by one; cells added
 * later (an append mid-run) enter immediately with no queued delay.
 */
function useMountStagger(step = 0.05, base = 0.16, cap = 14) {
  const t0 = useRef(performance.now());
  return (i: number) =>
    performance.now() - t0.current < 450 ? base + Math.min(i, cap) * step : 0;
}

/**
 * Re-mounts on value change: an accent wash + pop marks the mutation.
 *
 * Framer Motion interpolates between concrete colors, so the endpoints are
 * resolved from the semantic layer rather than written here — a literal would
 * survive a retheme and flash the wrong color, which is exactly what happened
 * with the previous palette.
 */
function Flash({ value, raw = false, delay = 0 }: { value: JsonValue; raw?: boolean; delay?: number }) {
  const reduced = useReducedMotion();
  const text = raw ? String(value) : fmt(value);
  const [from, to] = flashColors();
  return (
    <motion.span
      key={text}
      className="flash"
      initial={reduced ? false : { backgroundColor: from, scale: 1.12 }}
      animate={{ backgroundColor: to, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut', delay }}
    >
      {text}
    </motion.span>
  );
}

/**
 * The drawn diagram frame: a hairline outline traces itself around the
 * structure (SVG pathLength), then the name tag fades onto the border.
 */
function Frame({
  name,
  tag,
  truncated,
  className = '',
  children,
}: {
  name: string;
  tag: string;
  truncated?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={`struct ${className}`}
      layout
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.16 } }}
      transition={{ duration: 0.2 }}
    >
      <svg className="struct-outline" aria-hidden="true">
        <motion.rect
          pathLength={1}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.55, ease: drawEase }}
        />
      </svg>
      <motion.div
        className="struct-label"
        initial={reduced ? false : { opacity: 0, y: 3 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: reduced ? 0 : 0.28 }}
      >
        <span className="struct-name">{name}</span>
        <span className="struct-kind">{tag}</span>
        {truncated && (
          <span className="truncated-mark" title="value truncated">
            …
          </span>
        )}
      </motion.div>
      {children}
    </motion.div>
  );
}

/** One data cell: springs into being, flashes on mutation, exits by shrink. */
function Cell({
  value,
  delay = 0,
  raw = false,
  className = 'cell',
}: {
  value: JsonValue;
  delay?: number;
  raw?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      layout
      initial={reduced ? false : { opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={
        reduced
          ? { opacity: 0 }
          : { opacity: 0, scale: 0.4, transition: { duration: 0.14 } }
      }
      transition={{ ...spring, delay }}
    >
      <Flash value={value} raw={raw} />
    </motion.div>
  );
}

/** Pointer chip + a drawn arrow, gliding between cells via shared layoutId. */
function Pointer({ name }: { name: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      layoutId={`ptr-${name}`}
      layout
      className="pointer"
      transition={spring}
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span className="pointer-name">{name}</span>
      <svg className="pointer-arrow" viewBox="0 0 10 13" width="10" height="13" aria-hidden="true">
        <motion.path
          d="M5 0.5 V7.5 M1.5 7 L5 12 L8.5 7"
          pathLength={1}
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.32, ease: drawEase, delay: reduced ? 0 : 0.1 }}
        />
      </svg>
    </motion.div>
  );
}

const chipsAt = (pointers: VarSnapshot[], i: number) =>
  pointers.filter((p) => typeof p.value === 'number' && p.value === i);

/** Slot for pointers parked out of range (-1, or len after a loop ends). */
function GhostSlot({ chips, label }: { chips: VarSnapshot[]; label: string }) {
  return (
    <motion.div className="array-col ghost" layout="position" initial={false}>
      <div className="chip-slot">
        {chips.map((p) => (
          <Pointer key={p.name} name={p.name} />
        ))}
      </div>
      <div className="cell ghost-cell" aria-hidden="true" />
      <div className="index-label">{label}</div>
    </motion.div>
  );
}

/**
 * One value box that glides between positions on a swap: the shared `layoutId`
 * makes Framer animate it from its old slot to its new one. A box that just
 * moved is lifted onto a raised lane in its travel direction (rightward over
 * leftward) so two swapping cells visibly pass each other instead of merging
 * at the midpoint — a static z/offset, so it never replays on a re-render.
 */
function ValueBox({
  layoutId,
  value,
  raw,
  dir,
  delay,
}: {
  layoutId: string;
  value: JsonValue;
  raw?: boolean;
  dir: number;
  delay: number;
}) {
  const reduced = useReducedMotion();
  const lift = reduced ? 0 : dir * -6; // rightward rises, leftward dips
  return (
    <motion.div
      layoutId={layoutId}
      layout
      className={`cell-glide${dir !== 0 ? ' moving' : ''}`}
      style={{ zIndex: dir > 0 ? 6 : dir < 0 ? 5 : 1, y: lift }}
      transition={spring}
    >
      <div className="cell">
        <Flash value={value} raw={raw} delay={delay} />
      </div>
    </motion.div>
  );
}

function CellRail({
  name,
  items,
  pointers,
  dense,
  raw = false,
}: {
  name: string;
  items: JsonValue[];
  pointers: VarSnapshot[];
  dense: boolean;
  raw?: boolean;
}) {
  const reduced = useReducedMotion();
  const delay = useMountStagger();
  const { ids, dir } = useSlotIds(items);
  const before = chipsAt(pointers, -1);
  const after = chipsAt(pointers, items.length);
  return (
    <div className={`array-row${dense ? ' dense' : ''}`}>
      {before.length > 0 && <GhostSlot chips={before} label="-1" />}
      {/* Columns are keyed by position (index labels + pointer chips stay put);
          the value box inside each glides between columns by element identity. */}
      <AnimatePresence mode="popLayout">
        {items.map((v, i) => (
          <motion.div
            className="array-col"
            key={i}
            layout="position"
            initial={reduced ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={
              reduced
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.4, transition: { duration: 0.14 } }
            }
            transition={{ ...spring, delay: delay(i) }}
          >
            {pointers.length > 0 && (
              <div className="chip-slot">
                {chipsAt(pointers, i).map((p) => (
                  <Pointer key={p.name} name={p.name} />
                ))}
              </div>
            )}
            <ValueBox
              layoutId={`cell-${name}-${ids[i]}`}
              value={v}
              raw={raw}
              dir={dir[i]!}
              delay={delay(i)}
            />
            <div className="index-label">{i}</div>
          </motion.div>
        ))}
      </AnimatePresence>
      {items.length === 0 && <div className="empty-slot">empty</div>}
      {after.length > 0 && <GhostSlot chips={after} label={String(items.length)} />}
    </div>
  );
}

/** One-time WebGL probe; a machine that can't raster falls back to the rail. */
let webglOk: boolean | undefined;
function hasWebGL(): boolean {
  if (webglOk === undefined) {
    try {
      const c = document.createElement('canvas');
      webglOk = !!(c.getContext('webgl2') ?? c.getContext('webgl'));
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}

/** A crashed canvas (context loss, driver quirks) degrades to the 2D rail. */
class Stage3DBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Canvas width for n blocks — also sizes the loading placeholder, so the
 *  frame doesn't resize when the chunk arrives. */
const stage3dWidth = (n: number) => Math.min(680, Math.max(300, 110 + n * 58));

const ArrayView: FC<ViewProps> = ({ snap, pointers }) => {
  const reduced = useReducedMotion();
  const items = Array.isArray(snap.value) ? snap.value : [];
  const rail = (
    <CellRail name={snap.name} items={items} pointers={pointers} dense={items.length > 12} />
  );
  // The extruded-block stage only makes sense where height can encode value:
  // finite numbers, few enough to stay readable. Everything else (strings,
  // nested values, 25+ elements, reduced motion, no WebGL) keeps the rail.
  const use3d =
    !reduced &&
    items.length > 0 &&
    items.length <= 24 &&
    items.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    hasWebGL();
  return (
    <Frame name={snap.name} tag={`array · ${items.length}`} truncated={snap.truncated}>
      {use3d ? (
        <Stage3DBoundary fallback={rail}>
          {/* While the three.js chunk loads, hold an empty stage-sized box —
              flashing the 2D rail here reads as a glitch, and the entrance
              rise plays the "something is coming" role once the chunk lands. */}
          <Suspense
            fallback={<div className="array3d" style={{ width: stage3dWidth(items.length) }} />}
          >
            <Array3D
              width={stage3dWidth(items.length)}
              items={items as number[]}
              pointers={pointers
                .filter((p) => typeof p.value === 'number')
                .map((p) => ({ name: p.name, index: p.value as number }))}
            />
          </Suspense>
        </Stage3DBoundary>
      ) : (
        rail
      )}
    </Frame>
  );
};

const StringView: FC<ViewProps> = ({ snap, pointers }) => {
  const s = typeof snap.value === 'string' ? snap.value : fmt(snap.value);
  // long prose with nobody indexing it reads better as one tile than 200 cells
  if (s.length > 24 && pointers.length === 0) {
    return (
      <Frame name={snap.name} tag="string" truncated={snap.truncated}>
        <div className="string-tile">
          <Flash value={JSON.stringify(s)} raw />
        </div>
      </Frame>
    );
  }
  return (
    <Frame name={snap.name} tag={`string · ${s.length}`} truncated={snap.truncated}>
      <CellRail name={snap.name} items={[...s]} pointers={pointers} dense={s.length > 12} raw />
    </Frame>
  );
};

const MatrixView: FC<ViewProps> = ({ snap }) => {
  const rows = (Array.isArray(snap.value) ? snap.value : []).map((r) =>
    Array.isArray(r) ? r : [r],
  );
  const cols = Math.max(0, ...rows.map((r) => r.length));
  const delay = useMountStagger(0.035, 0.16, 20);
  return (
    <Frame name={snap.name} tag={`matrix · ${rows.length}×${cols}`} truncated={snap.truncated}>
      <div
        className="matrix-grid"
        style={{ gridTemplateColumns: `max-content repeat(${cols}, max-content)` }}
      >
        <div className="matrix-corner" />
        {Array.from({ length: cols }, (_, c) => (
          <div className="matrix-head" key={`c${c}`}>
            {c}
          </div>
        ))}
        {rows.map((row, r) => [
          <div className="matrix-head" key={`r${r}`}>
            {r}
          </div>,
          ...row.map((v, c) => (
            // diagonal build wave — reads like the DP table filling itself in
            <Cell key={`${r}:${c}`} value={v} delay={delay(r + c)} className="cell cell-sm" />
          )),
        ])}
      </div>
    </Frame>
  );
};

const StackView: FC<ViewProps> = ({ snap, pointers }) => {
  const reduced = useReducedMotion();
  const items = Array.isArray(snap.value) ? snap.value : [];
  const delay = useMountStagger();
  const top = items.length - 1;
  return (
    <Frame name={snap.name} tag={`stack · ${items.length}`} truncated={snap.truncated} className="struct-stack">
      <div className="stack-col">
        <AnimatePresence mode="popLayout">
          {items
            .map((v, i) => (
              <motion.div
                key={i}
                className="stack-row"
                layout
                initial={reduced ? false : { opacity: 0, y: -18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: -24, transition: { duration: 0.18 } }
                }
                transition={{ ...spring, delay: delay(top - i) }}
              >
                <span className="stack-mark">
                  {i === top && (
                    <motion.span layoutId={`top-${snap.name}`} layout className="stack-top" transition={spring}>
                      top&nbsp;→
                    </motion.span>
                  )}
                  {chipsAt(pointers, i).map((p) => (
                    <span key={p.name} className="stack-ptr">
                      {p.name}&nbsp;→
                    </span>
                  ))}
                </span>
                <div className="cell stack-cell">
                  <Flash value={v} />
                </div>
              </motion.div>
            ))
            .reverse()}
        </AnimatePresence>
        {items.length === 0 && <div className="empty-slot">empty</div>}
      </div>
    </Frame>
  );
};

const QueueView: FC<ViewProps> = ({ snap, pointers }) => {
  const reduced = useReducedMotion();
  const items = Array.isArray(snap.value) ? snap.value : [];
  const delay = useMountStagger();
  // Stable identities so a dequeue exits at the front instead of re-keying
  // every element: track how many items have ever left the front.
  const idRef = useRef({ prev: [] as JsonValue[], offset: 0 });
  const { prev } = idRef.current;
  const d = prev.length - items.length;
  if (d > 0 && JSON.stringify(prev.slice(d)) === JSON.stringify(items)) {
    idRef.current.offset += d; // items left the front
  } else if (d < 0 && JSON.stringify(items.slice(-d)) === JSON.stringify(prev)) {
    idRef.current.offset += d; // scrubbed backwards: fronts restored
  }
  idRef.current.prev = items;
  const base = idRef.current.offset;

  return (
    <Frame name={snap.name} tag={`queue · ${items.length}`} truncated={snap.truncated} className="struct-queue">
      <div className="queue-lane">
        <AnimatePresence mode="popLayout">
          {items.map((v, i) => (
            <motion.div
              key={base + i}
              className="queue-col"
              layout="position"
              initial={reduced ? false : { opacity: 0, x: 26 }}
              animate={{ opacity: 1, x: 0 }}
              exit={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, x: -28, transition: { duration: 0.18 } }
              }
              transition={{ ...spring, delay: delay(i) }}
            >
              {pointers.length > 0 && (
                <div className="chip-slot">
                  {chipsAt(pointers, i).map((p) => (
                    <Pointer key={p.name} name={p.name} />
                  ))}
                </div>
              )}
              <div className="cell">
                <Flash value={v} />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && <div className="empty-slot">empty</div>}
      </div>
      {items.length > 0 && (
        <div className="queue-ends">
          <span className="queue-end">← out · front</span>
          <span className="queue-end">rear · in ←</span>
        </div>
      )}
    </Frame>
  );
};

const DictView: FC<ViewProps> = ({ snap }) => {
  const reduced = useReducedMotion();
  const entries =
    snap.value && typeof snap.value === 'object' && !Array.isArray(snap.value)
      ? Object.entries(snap.value)
      : [];
  const delay = useMountStagger();
  return (
    <Frame name={snap.name} tag={`map · ${entries.length}`} truncated={snap.truncated} className="struct-map">
      <div className="map-rows">
        <AnimatePresence mode="popLayout">
          {entries.map(([k, v], i) => (
            <motion.div
              key={k}
              className="map-row"
              layout
              initial={reduced ? false : { opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, x: 10, transition: { duration: 0.14 } }
              }
              transition={{ ...spring, delay: delay(i) }}
            >
              <span className="map-key">
                <Flash value={k} raw />
              </span>
              <svg className="map-arrow" viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                <motion.path
                  d="M1 5 H22 M18 1.5 L23 5 L18 8.5"
                  pathLength={1}
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.3, ease: drawEase, delay: delay(i) + 0.08 }}
                />
              </svg>
              <span className="map-val">
                <Flash value={v} />
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {entries.length === 0 && <div className="empty-slot">empty</div>}
      </div>
    </Frame>
  );
};

const SetView: FC<ViewProps> = ({ snap }) => {
  const reduced = useReducedMotion();
  const items = Array.isArray(snap.value) ? snap.value : [];
  const delay = useMountStagger();
  return (
    <Frame name={snap.name} tag={`set · ${items.length}`} truncated={snap.truncated} className="struct-set">
      <div className="chip-row">
        <AnimatePresence mode="popLayout">
          {items.map((v, i) => (
            <motion.div
              key={fmt(v)}
              className="set-chip"
              layout
              initial={reduced ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={
                reduced
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.5, transition: { duration: 0.14 } }
              }
              transition={{ ...spring, delay: delay(i) }}
            >
              {fmt(v)}
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && <div className="empty-slot">empty</div>}
      </div>
    </Frame>
  );
};

/** A drawn → arrow between linked-list nodes. */
function LLArrow({ delay = 0 }: { delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <svg className="ll-arrow" viewBox="0 0 26 12" width="26" height="12" aria-hidden="true">
      <motion.path
        d="M1 6 H19 M15 2 L20 6 L15 10"
        pathLength={1}
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.28, ease: drawEase, delay: delay + 0.06 }}
      />
    </svg>
  );
}

interface LinkedListValue {
  vals?: JsonValue[];
  cyclesTo?: number | null;
}

const LinkedListView: FC<ViewProps> = ({ snap }) => {
  const reduced = useReducedMotion();
  const v = (snap.value ?? {}) as LinkedListValue;
  const vals = Array.isArray(v.vals) ? v.vals : [];
  const cyclesTo = typeof v.cyclesTo === 'number' ? v.cyclesTo : null;
  const delay = useMountStagger();
  return (
    <Frame name={snap.name} tag={`list · ${vals.length}`} truncated={snap.truncated} className="struct-list">
      <div className="ll-row">
        <AnimatePresence mode="popLayout">
          {vals.map((val, i) => (
            <motion.div
              className="ll-node-wrap"
              key={i}
              layout="position"
              initial={reduced ? false : { opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.5, transition: { duration: 0.14 } }}
              transition={{ ...spring, delay: delay(i) }}
            >
              <div className="cell ll-node">
                <Flash value={val} delay={delay(i)} />
              </div>
              {i < vals.length - 1 && <LLArrow delay={delay(i)} />}
            </motion.div>
          ))}
        </AnimatePresence>
        {vals.length === 0 && <div className="empty-slot">null</div>}
        {vals.length > 0 && cyclesTo === null && (
          <>
            <LLArrow />
            <span className="ll-null" aria-label="null">
              ∅
            </span>
          </>
        )}
      </div>
      {cyclesTo !== null && (
        <div className="ll-cycle">↺ tail links back to node #{cyclesTo}</div>
      )}
    </Frame>
  );
};

interface TreeValue {
  val: JsonValue;
  left: TreeValue | null;
  right: TreeValue | null;
}
interface TreeNodeLayout {
  id: number;
  val: JsonValue;
  col: number;
  depth: number;
}
interface TreeEdge {
  from: number;
  to: number;
}

/** In-order column assignment (classic non-overlapping binary layout). */
function layoutTree(root: TreeValue | null) {
  const nodes: TreeNodeLayout[] = [];
  const edges: TreeEdge[] = [];
  let col = 0;
  let id = 0;
  let maxDepth = 0;
  const visit = (node: TreeValue | null, depth: number): number | null => {
    if (!node || typeof node !== 'object') return null;
    const leftId = visit(node.left, depth + 1);
    const myId = id++;
    nodes.push({ id: myId, val: node.val, col: col++, depth });
    maxDepth = Math.max(maxDepth, depth);
    if (leftId !== null) edges.push({ from: myId, to: leftId });
    const rightId = visit(node.right, depth + 1);
    if (rightId !== null) edges.push({ from: myId, to: rightId });
    return myId;
  };
  visit(root, 0);
  return { nodes, edges, cols: col, depth: maxDepth };
}

const COL_W = 56;
const ROW_H = 66;
const NODE = 40;

const TreeView: FC<ViewProps> = ({ snap }) => {
  const reduced = useReducedMotion();
  const root = (snap.value ?? null) as TreeValue | null;
  const { nodes, edges, cols, depth } = layoutTree(root);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const width = Math.max(cols, 1) * COL_W;
  const height = (depth + 1) * ROW_H;
  const cx = (n: TreeNodeLayout) => n.col * COL_W + COL_W / 2;
  const cy = (n: TreeNodeLayout) => n.depth * ROW_H + NODE / 2 + 4;
  const delay = useMountStagger(0.045, 0.16, 24);

  return (
    <Frame name={snap.name} tag={`tree · ${nodes.length}`} truncated={snap.truncated} className="struct-tree">
      {nodes.length === 0 ? (
        <div className="empty-slot">null</div>
      ) : (
        <div className="tree-canvas" style={{ width, height }}>
          <svg className="tree-edges" width={width} height={height} aria-hidden="true">
            {edges.map((e) => {
              const a = byId.get(e.from)!;
              const b = byId.get(e.to)!;
              return (
                <motion.line
                  key={`${e.from}-${e.to}`}
                  x1={cx(a)}
                  y1={cy(a)}
                  x2={cx(b)}
                  y2={cy(b)}
                  pathLength={1}
                  initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: drawEase, delay: delay(b.depth) }}
                />
              );
            })}
          </svg>
          {nodes.map((n) => (
            <motion.div
              key={n.id}
              className="tree-node"
              style={{ left: n.col * COL_W, top: n.depth * ROW_H + 4 }}
              initial={reduced ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: delay(n.depth) }}
            >
              <Flash value={n.val} delay={delay(n.depth)} />
            </motion.div>
          ))}
        </div>
      )}
    </Frame>
  );
};

/** Compact tile for plain scalars, shown in the readout strip. */
export const ScalarTile: FC<ViewProps> = ({ snap }) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="scalar-block"
      layout
      initial={reduced ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, transition: { duration: 0.14 } }}
      transition={spring}
    >
      <span className="scalar-name">{snap.name}</span>
      <Flash value={snap.value} />
    </motion.div>
  );
};

/** kind → component; new kinds (future languages) are additive entries. */
export const viewRegistry: Record<VarKind, FC<ViewProps>> = {
  array: ArrayView,
  matrix: MatrixView,
  dict: DictView,
  set: SetView,
  string: StringView,
  scalar: ScalarTile,
  linkedlist: LinkedListView,
  tree: TreeView,
};

/** shape → component, for arrays reclassified by behavior. */
export const shapeRegistry = {
  stack: StackView,
  queue: QueueView,
} as const;
