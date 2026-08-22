import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface SplitterProps {
  /** `vertical` = a vertical bar dragged left/right; `horizontal` = up/down. */
  orientation: 'vertical' | 'horizontal';
  /** Current position as a fraction (0–1) of the container's size. */
  value: number;
  onChange: (value: number) => void;
  /** Element the fraction is measured against. */
  containerRef: RefObject<HTMLElement | null>;
  min?: number;
  max?: number;
  label: string;
}

const STEP = 0.02;

/**
 * Drag handle between two panes.
 *
 * Reports a *fraction* rather than pixels so a split survives a window resize
 * with its proportions intact.
 *
 * The gesture lives on `window` listeners installed by an effect, not on the
 * handle's own pointer events. That is deliberate: the earlier version ended
 * the drag from the element's `onPointerUp`, which silently fails to run when
 * the button is released outside the window, when the browser has already
 * released pointer capture before dispatching, or when `releasePointerCapture`
 * throws on a stale id. Any of those left `dragging` stuck true, so afterwards
 * merely *hovering* the bar kept resizing. An effect's cleanup is guaranteed
 * to run on state change and on unmount, so the drag can no longer outlive the
 * mouse — and a `buttons === 0` check bails out even if a release is missed
 * entirely.
 *
 * Keyboard-operable: it is a real `separator` with arrow-key stepping, since a
 * pointer-only resize is unusable for anyone not using a mouse.
 */
export function Splitter({
  orientation,
  value,
  onChange,
  containerRef,
  min = 0.2,
  max = 0.8,
  label,
}: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  // read through a ref so the move listener never needs re-installing mid-drag
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const fromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return null;
      const raw =
        orientation === 'vertical'
          ? (clientX - box.left) / box.width
          : (clientY - box.top) / box.height;
      return clamp(raw);
    },
    [containerRef, orientation, clamp],
  );

  useEffect(() => {
    if (!dragging) return;

    const body = document.body;
    const cls = orientation === 'vertical' ? 'resizing-col' : 'resizing-row';
    body.classList.add(cls);

    const onMove = (e: PointerEvent) => {
      // no button held: the release was missed (outside the window, a native
      // drag, a devtools pause) — treat the gesture as over rather than
      // resizing on every subsequent hover
      if (e.buttons === 0) {
        setDragging(false);
        return;
      }
      e.preventDefault();
      const next = fromPointer(e.clientX, e.clientY);
      if (next !== null) onChangeRef.current(next);
    };
    const stop = () => setDragging(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    // a release the page never sees at all still has to end the drag
    window.addEventListener('blur', stop);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      body.classList.remove('resizing-col', 'resizing-row');
    };
  }, [dragging, orientation, fromPointer]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === back) onChange(clamp(value - STEP));
    else if (e.key === fwd) onChange(clamp(value + STEP));
    else if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className={`splitter ${orientation}${dragging ? ' dragging' : ''}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      onPointerDown={(e) => {
        if (e.button !== 0) return; // left button / primary touch only
        e.preventDefault(); // suppress the text selection the drag would start
        setDragging(true);
      }}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(clamp(0.5))}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  );
}
