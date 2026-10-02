import { useReducedMotion } from 'framer-motion';
import { Component, createContext, useContext, type ReactNode } from 'react';

/**
 * 3D eligibility, shared by the workbench stage and the landing exhibits so
 * both refuse WebGL under the same conditions. Deliberately outside `three/`:
 * nothing here may pull three.js out of its lazy chunk.
 */

/** One-time WebGL probe; a machine that can't raster falls back to the rail. */
let webglOk: boolean | undefined;
export function hasWebGL(): boolean {
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
export class Stage3DBoundary extends Component<
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

/**
 * Views inside force their 2D form. The workbench's caller strip uses it: a
 * dimmed, secondary copy of what the student was looking at should never
 * spin up another WebGL scene on every helper call.
 */
const Flat2DContext = createContext(false);
export function Flat2D({ children }: { children: ReactNode }) {
  return <Flat2DContext.Provider value={true}>{children}</Flat2DContext.Provider>;
}

/** Shared 3D eligibility: never against the viewer's wishes, their GPU, or a Flat2D. */
export function use3dBase(): boolean {
  const flat = useContext(Flat2DContext);
  const reduced = useReducedMotion();
  return !flat && !reduced && hasWebGL();
}
