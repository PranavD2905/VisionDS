/**
 * THEME LAYER 3 — the JavaScript seam.
 *
 * Two consumers cannot read CSS custom properties directly: CodeMirror builds
 * its own stylesheet outside our cascade, and Framer Motion has to interpolate
 * between concrete color values. Rather than let either one hard-code a hex —
 * which is how the visualizer ended up flashing a color from a retired theme —
 * they resolve the *same* semantic tokens through here.
 *
 * So the dependency still points at the abstraction: JS asks for `--accent`,
 * never for acid yellow.
 */

/** Every semantic token JS is allowed to ask for. Adding a color to the app
 *  means adding it to `semantic.css` and to this union — not a literal. */
export type SemanticToken =
  | '--bg'
  | '--bg-deep'
  | '--panel'
  | '--panel-2'
  | '--cell-bg'
  | '--cell-bg-raised'
  | '--border'
  | '--border-strong'
  | '--text'
  | '--text-inverse'
  | '--muted'
  | '--muted-dim'
  | '--accent'
  | '--accent-strong'
  | '--accent-soft'
  | '--accent-wash'
  | '--pass'
  | '--fail'
  | '--warn'
  | '--ai'
  | '--flash-from'
  | '--flash-to'
  | '--editor-bg'
  | '--editor-text'
  | '--editor-gutter'
  | '--editor-keyword'
  | '--editor-entity'
  | '--editor-type'
  | '--editor-string'
  | '--editor-number'
  | '--editor-comment'
  | '--editor-operator'
  | '--editor-meta'
  | '--editor-invalid';

/**
 * Resolve one semantic token to a concrete color.
 *
 * Reads from the document element so a `[data-theme]` override on `:root` is
 * picked up automatically. Returns `fallback` when there is no DOM (tests) or
 * the token is unset, so a missing token degrades to an invisible default
 * instead of throwing inside a render.
 */
export function token(name: SemanticToken, fallback = 'transparent'): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Resolve several tokens at once, keyed by token name. */
export function readTokens<T extends readonly SemanticToken[]>(
  ...names: T
): Record<T[number], string> {
  const out = {} as Record<T[number], string>;
  for (const name of names) out[name as T[number]] = token(name);
  return out;
}

/**
 * Same token, at a chosen alpha, as a plain `rgba()`.
 *
 * Deliberately not `color-mix()`: custom properties compute to an unresolved
 * token stream, so a `color-mix()` string reaches Framer Motion uninterpolable
 * and the animation snaps instead of fading. Parsing to rgba keeps every JS
 * consumer on values it can actually tween.
 */
export function tokenAlpha(name: SemanticToken, alpha: number): string {
  const rgb = toRgb(token(name));
  if (!rgb) return 'transparent';
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Parse `#rgb`, `#rrggbb`, `rgb()` or `rgba()` into channel values. */
function toRgb(value: string): [number, number, number] | null {
  const v = value.trim();
  if (v.startsWith('#')) {
    const hex = v.slice(1);
    const full =
      hex.length === 3 || hex.length === 4
        ? hex
            .slice(0, 3)
            .split('')
            .map((c) => c + c)
            .join('')
        : hex.slice(0, 6);
    if (full.length !== 6) return null;
    const n = Number.parseInt(full, 16);
    if (Number.isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const nums = v.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return null;
  return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
}
