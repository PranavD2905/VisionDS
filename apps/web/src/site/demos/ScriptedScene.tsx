import { Suspense, lazy, useEffect, useState, type ReactNode, type RefObject } from 'react';
import { use3dBase, Stage3DBoundary } from '../../components/stage/gate3d';
import { useMeasuredBox } from '../../components/stage/StageSize';
import type { Stage3DProps } from '../../components/stage/three/Stage3D';

/** Same lazy chunk the workbench stage loads — three.js stays out of the
 *  landing bundle until an exhibit actually mounts. */
const Stage3D = lazy(() => import('../../components/stage/three/Stage3D'));

/** A scene's data without the sizing the player supplies. */
type SceneSpec = Stage3DProps extends infer P
  ? P extends Stage3DProps
    ? Omit<P, 'width' | 'height' | 'paused'>
    : never
  : never;

/** One step of a scripted exhibit: the structure as the tracer would have
 *  snapshotted it, plus an optional readout of scalar locals beneath it. */
export interface ScriptFrame {
  scene: SceneSpec;
  readout?: Array<[label: string, value: string]>;
}

/**
 * Plays a short, hand-written run through the *real* workbench scenes.
 *
 * The scenes damp every quantity toward a target that is a pure function of
 * the frame they are given, so advancing a cursor on a timer is all it takes
 * to get the same choreography a live run gets — swap arcs, pointer glides,
 * drop-ins. The loop pauses offscreen and in hidden tabs (no timer, no render
 * loop); viewers who prefer reduced motion, or have no WebGL, get the flat
 * fallback, exactly as on the workbench stage.
 */
export function ScriptedScene({
  frames,
  fallback,
  height,
  interval = 1100,
  hold = 2,
}: {
  frames: ScriptFrame[];
  fallback: ReactNode;
  height: number;
  /** ms per frame. */
  interval?: number;
  /** Extra intervals the final frame stays up before the loop restarts. */
  hold?: number;
}) {
  const ok = use3dBase();
  const [ref, box] = useMeasuredBox<HTMLDivElement>();
  const active = useActive(ref);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    if (!active || !ok) return;
    const last = frames.length - 1;
    let wait = 0;
    const id = window.setInterval(() => {
      setCursor((c) => {
        if (c < last) return c + 1;
        if (wait++ < hold) return c;
        wait = 0;
        return 0;
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [active, ok, frames.length, interval, hold]);

  if (!ok) return <>{fallback}</>;
  const frame = frames[Math.min(cursor, frames.length - 1)]!;
  const width = Math.floor(box.width);

  return (
    <div className="d-scene">
      <div ref={ref} className="d-scene-canvas" style={{ height }}>
        {width > 0 && (
          <Stage3DBoundary fallback={fallback}>
            <Suspense fallback={null}>
              <Stage3D
                {...(frame.scene as Stage3DProps)}
                width={width}
                height={height}
                paused={!active}
              />
            </Suspense>
          </Stage3DBoundary>
        )}
      </div>
      {frame.readout && (
        <div className="d-readout">
          {frame.readout.map(([label, value]) => (
            <span className="d-chip" key={label}>
              {label}
              <b>{value}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** True while the element is on screen and the tab is visible. */
function useActive(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(false);
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setInView(!!entries[0]?.isIntersecting), {
      rootMargin: '120px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return inView && visible;
}
