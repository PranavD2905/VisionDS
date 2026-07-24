import type { ComponentType } from 'react';

/**
 * The contract between the catalogue and the things it displays.
 *
 * A demo knows how to draw itself and nothing else — not its index, not its
 * caption, not where on the page it sits. The frame knows how to index and
 * caption a specimen and nothing about what is inside it. Because every demo
 * satisfies this one empty-props interface, any demo can stand in any frame.
 */
export type DemoComponent = ComponentType;

/** How a specimen is stamped: the interaction or capability it illustrates. */
export interface SpecimenTagSpec {
  /** Short uppercase label, e.g. "POINTERS". */
  label: string;
  /** A single glyph. Decorative — the label carries the meaning. */
  glyph?: string;
}

/**
 * One entry in the catalogue. Content only: no JSX, no styling decisions, so
 * the same data could drive a different layout without being rewritten.
 */
export interface SpecimenSpec {
  /** Stable id, also the registry key for the demo. */
  id: string;
  /** Catalogue index, e.g. "001". */
  index: string;
  /** Single-letter class: S(tructure), V(erdict), R(untime), … */
  kind: string;
  /** The name shown in the footer bar. */
  title: string;
  tag: SpecimenTagSpec;
  /** Optional prose shown under the demo. Most specimens need none. */
  note?: string;
  /** Registry key of the demo to mount. Omit for a copy-only specimen. */
  demo?: string;
  /** Column span in the catalogue grid. */
  span?: 1 | 2 | 3;
  /** Footer right-hand cell: a status word, e.g. "live". */
  status?: string;
}
