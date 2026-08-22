import { createContext, useContext, useEffect, useRef, useState, type RefObject } from 'react';

export interface StageBox {
  width: number;
  height: number;
}

/** Zero means "unmeasured" — consumers fall back to their preferred size. */
const StageSizeContext = createContext<StageBox>({ width: 0, height: 0 });

export const StageSizeProvider = StageSizeContext.Provider;

export function useStageBox(): StageBox {
  return useContext(StageSizeContext);
}

/**
 * Live content-box size of an element, via ResizeObserver.
 *
 * The stage has to know how much room it actually has: the pane is
 * user-resizable now, so a size read once at mount goes stale the moment the
 * splitter moves.
 */
export function useMeasuredBox<T extends HTMLElement>(): [RefObject<T | null>, StageBox] {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<StageBox>({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      // ignore sub-pixel churn; every update re-renders the whole stage
      setBox((prev) =>
        Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1
          ? prev
          : { width, height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, box];
}
