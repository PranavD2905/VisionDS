import { isOpenAt, type CallNode, type CallTree } from '@visionds/trace-schema';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../lib/format';
import { useVis } from '../store';
import { layoutCallTree } from './stage/callTreeLayout';

const COL_W = 150;
const ROW_H = 108;
/** Ovals share one height so the layout grid stays regular; only width varies. */
const NODE_H = 50;
const NODE_W_MIN = 58; // a short label like `fib(3)` lands here — near-circular
const NODE_W_MAX = COL_W - 14;
const CHAR_W = 6.9; // IBM Plex Mono at 11.5px
/** Gap left between an oval's edge and the arrow, so heads don't touch the rim. */
const ARROW_GAP = 5;
/** Width of the detail popover, in canvas pixels. */
const POP_W = 236;

const spring = { type: 'spring', stiffness: 420, damping: 32, mass: 0.9 } as const;
const drawEase = [0.16, 1, 0.3, 1] as const;

function clip(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * What a node says: the function name and the arguments *this* call was made
 * with — `fib(3)`, `hanoi(2, 'A', 'B')` — never the function's body. The full,
 * unclipped form with parameter names is in the node's tooltip.
 */
function signature(node: CallNode, maxArgs = 18) {
  const args = node.args.map((a) => fmt(a.value)).join(', ');
  return `${node.func}(${clip(args, maxArgs)})`;
}

function fullSignature(node: CallNode) {
  return `${node.func}(${node.args.map((a) => `${a.name}=${fmt(a.value)}`).join(', ')})`;
}

/** Ellipse wide enough for its label — a circle when the label is short. */
function ovalWidth(label: string) {
  return Math.min(NODE_W_MAX, Math.max(NODE_W_MIN, Math.round(label.length * CHAR_W) + 26));
}

/**
 * The recursion tree: one oval per call the program actually made, joined by
 * arrows that point down from caller to callee. Deliberately flat 2D — a call
 * tree is about shape and order, which read faster without perspective.
 *
 * It is not laid out and then revealed all at once — a frame appears at the
 * step it was entered and fills in its return value at the step it returned,
 * so playing or scrubbing the transport draws and unwinds the tree. Like every
 * other scene, the render is a pure function of the cursor, so it is scrub-safe.
 */
export function CallTreeView({ tree }: { tree: CallTree }) {
  const cursor = useVis((s) => s.cursor);
  const seek = useVis((s) => s.seek);
  const reduced = useReducedMotion();
  const layout = useMemo(() => layoutCallTree(tree, COL_W, ROW_H), [tree]);
  /** Node whose detail popover is open; null when none is. */
  const [openId, setOpenId] = useState<number | null>(null);

  const visible = useMemo(
    () => tree.nodes.filter((n) => n.enterStep <= cursor),
    [tree, cursor],
  );

  // the frame actually executing right now: the innermost one still on the stack
  const currentId = useMemo(() => {
    let best: number | null = null;
    for (const n of visible) {
      if (isOpenAt(n, cursor) && (best === null || n.enterStep > tree.nodes[best]!.enterStep)) {
        best = n.id;
      }
    }
    return best;
  }, [visible, cursor, tree]);

  // Dismiss on any click outside the popover. Clicks that land on a node are
  // left alone so the node's own handler can switch the popover across.
  useEffect(() => {
    if (openId === null) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.calltree-pop, .calltree-node')) return;
      setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openId]);

  // scrubbing back past a call un-draws its node — its popover goes with it
  useEffect(() => {
    if (openId !== null && tree.nodes[openId]!.enterStep > cursor) setOpenId(null);
  }, [openId, cursor, tree]);

  // keep the live frame on screen as the tree outgrows the pane
  const nodeRefs = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => {
    if (currentId === null) return;
    nodeRefs.current.get(currentId)?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [currentId, reduced]);

  if (tree.nodes.length === 0) {
    return <div className="empty-note stage-empty">no calls were recorded</div>;
  }

  /** Has this frame returned *as of the step on screen*? */
  const hasReturned = (n: CallNode) => n.exitStep !== undefined && cursor >= n.exitStep;

  const state = (n: CallNode) => {
    if (n.id === currentId) return 'current';
    if (hasReturned(n)) return 'done';
    return 'open';
  };

  const openNode = openId === null ? null : tree.nodes[openId]!;
  // float it beside the oval, flipping to the left when it would run off the end
  const openPos = (() => {
    if (!openNode) return null;
    const p = layout.pos[openNode.id]!;
    const half = ovalWidth(signature(openNode)) / 2;
    const right = p.x + half + 12;
    const left = right + POP_W > layout.width ? Math.max(4, p.x - half - 12 - POP_W) : right;
    return { left, top: p.y - NODE_H / 2 };
  })();

  return (
    <div className="calltree-wrap">
      <div className="calltree-scroll">
        <div className="calltree-canvas" style={{ width: layout.width, height: layout.height }}>
          <svg
            className="calltree-edges"
            width={layout.width}
            height={layout.height}
            aria-hidden="true"
          >
            <defs>
              {/* one head per state: markers can't inherit the line's color, so
                  each is styled by class alongside its edge */}
              {(['open', 'done', 'current'] as const).map((st) => (
                <marker
                  key={st}
                  id={`ct-head-${st}`}
                  className={`calltree-head ${st}`}
                  viewBox="0 0 9 9"
                  refX="8.5"
                  refY="4.5"
                  markerWidth="9"
                  markerHeight="9"
                  markerUnits="userSpaceOnUse"
                  orient="auto"
                >
                  <path d="M0.5,0.5 L8.5,4.5 L0.5,8.5 z" />
                </marker>
              ))}
            </defs>
            <AnimatePresence>
              {visible.map((n) => {
                if (n.parent === null) return null;
                const a = layout.pos[n.parent]!;
                const b = layout.pos[n.id]!;
                const st = state(n);
                return (
                  <motion.line
                    key={n.id}
                    className={`calltree-edge ${st}`}
                    x1={a.x}
                    y1={a.y + NODE_H / 2 + ARROW_GAP}
                    x2={b.x}
                    y2={b.y - NODE_H / 2 - ARROW_GAP}
                    pathLength={1}
                    markerEnd={`url(#ct-head-${st})`}
                    initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.32, ease: drawEase }}
                  />
                );
              })}
            </AnimatePresence>
          </svg>

          <AnimatePresence>
            {visible.map((n) => {
              const p = layout.pos[n.id]!;
              const st = state(n);
              const label = signature(n);
              const w = ovalWidth(label);
              return (
                <motion.button
                  key={n.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(n.id, el);
                    else nodeRefs.current.delete(n.id);
                  }}
                  type="button"
                  className={`calltree-node ${st}${n.exception ? ' threw' : ''}${
                    openId === n.id ? ' selected' : ''
                  }`}
                  style={{ left: p.x - w / 2, top: p.y - NODE_H / 2, width: w, height: NODE_H }}
                  aria-expanded={openId === n.id}
                  onClick={() => setOpenId((cur) => (cur === n.id ? null : n.id))}
                  initial={reduced ? false : { opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.14 } }}
                  transition={{ ...spring, delay: reduced ? 0 : 0.08 }}
                >
                  <span className="calltree-call">{label}</span>
                  <AnimatePresence>
                    {st === 'done' && (
                      <motion.span
                        className="calltree-ret"
                        initial={reduced ? false : { opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22 }}
                      >
                        → {clip(fmt(n.returnValue ?? null), 12)}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </AnimatePresence>

          {openNode && openPos && (
            <div
              className="calltree-pop"
              role="dialog"
              aria-label={`Call detail for ${openNode.func}`}
              style={{ left: openPos.left, top: openPos.top, width: POP_W }}
            >
              <div className="pop-row">
                <span className="pop-label">call</span>
                <code className="pop-call">{fullSignature(openNode)}</code>
              </div>

              {/* answered for the step on screen right now, not for the whole run */}
              {hasReturned(openNode) ? (
                <div className="pop-row returned">
                  <span className="pop-label">returned</span>
                  <code className="pop-value">{fmt(openNode.returnValue ?? null)}</code>
                </div>
              ) : (
                <div className="pop-row pending">
                  <span className="pop-label">returned</span>
                  <span className="pop-none">
                    not yet — still on the stack at step {cursor}
                  </span>
                </div>
              )}

              {openNode.exception && (
                <div className="pop-row threw">
                  <span className="pop-label">threw</span>
                  <code className="pop-value">
                    {openNode.exception.type}: {openNode.exception.message}
                  </code>
                </div>
              )}

              <button
                type="button"
                className="pop-jump"
                onClick={() => {
                  seek(openNode.enterStep);
                  setOpenId(null);
                }}
              >
                Jump to this call (step {openNode.enterStep}) →
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="calltree-legend">
        <span>
          <i className="dot current" /> running
        </span>
        <span>
          <i className="dot open" /> on the stack
        </span>
        <span>
          <i className="dot done" /> returned
        </span>
        <span className="calltree-count">
          {visible.length}/{tree.nodes.length} calls · depth {tree.maxDepth}
          {tree.truncated && ' · truncated'}
        </span>
      </div>
    </div>
  );
}
