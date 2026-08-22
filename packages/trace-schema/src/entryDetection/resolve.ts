/** The wire-level identity of an entry point: name plus owning class. */
export interface EntryLike {
  name: string;
  className: string | null;
}

/**
 * Resolve a client's entry pick against the code's real candidate list.
 *
 * Two rules, and both matter:
 *
 * 1. **Exact `{name, className}` first.** Matching on `name` alone cannot tell
 *    a free `foo` from `Solution::foo`, so picking the second in the dropdown
 *    used to regenerate the first — and a controlled `<select>` then snapped
 *    back to it, making the option unselectable.
 * 2. **Name-only as a fallback**, which keeps the self-correction the
 *    generators rely on: a stale override carried over from another language
 *    (Python's `className: null` racing a language switch) still resolves to
 *    this code's real entry instead of being trusted blindly.
 *
 * Both passes take the **last** match, matching the "last top-level def / last
 * public method" rule the detectors use. Callers on both sides of the wire —
 * the seed generator and the adapter that later prepares the run — must use
 * this same function, or Java overloads seed from one method and invoke
 * another.
 */
export function resolveEntryPick<T extends { name: string; className?: string | null }>(
  candidates: T[],
  override?: EntryLike | null,
): T | undefined {
  if (!override) return undefined;
  let nameOnly: T | undefined;
  let exact: T | undefined;
  for (const c of candidates) {
    if (c.name !== override.name) continue;
    nameOnly = c;
    // A candidate type with no className concept at all (JavaEntry — every
    // entry is a `Solution` method) has no opinion to disagree with, so the
    // name match is already exact.
    if (c.className === undefined || c.className === override.className) exact = c;
  }
  return exact ?? nameOnly;
}

/**
 * Collapse candidates that are the same choice.
 *
 * `EntryLike` identifies a function by name and class only, so Java overloads
 * (`f(int)` and `f(String)`) arrive indistinguishable: same label, duplicate
 * React keys, and both resolving to one method. Keeping the **last** of each
 * group matches `resolveEntryPick`, so the option shown is the one that runs.
 */
export function dedupeEntries<T extends { name: string; className?: string | null }>(
  entries: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const e of entries) byId.set(`${e.className ?? ''}.${e.name}`, e);
  return [...byId.values()];
}
