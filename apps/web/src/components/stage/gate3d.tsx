import { useReducedMotion } from 'framer-motion';
import { Component, type ReactNode } from 'react';

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

/** Shared 3D eligibility: never against the viewer's wishes or their GPU. */
export function use3dBase(): boolean {
  const reduced = useReducedMotion();
  return !reduced && hasWebGL();
}
