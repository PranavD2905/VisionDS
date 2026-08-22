/**
 * Build-time feature switches.
 *
 * A flag here hides a feature's *surfaces* without deleting it: the code, its
 * package and its store fields stay in place, so turning one back on is a
 * one-line change rather than a re-implementation.
 */

/**
 * The optional AI explain layer (`packages/explainer`, `ExplainPanel`,
 * step captions). Off for now — the trace is the product, and the explainer
 * is not wanted on screen yet. Flip to `true` to bring back the panel and
 * the AI caption strip; nothing else needs editing.
 */
export const EXPLAINER_ENABLED = false;
