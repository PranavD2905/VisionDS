import type { JsonValue } from '@visionds/trace-schema';
import { useRef } from 'react';

/**
 * Assigns a stable identity to each array element and tracks where it moved
 * from, so a swap/reorder animates as boxes physically gliding past each other
 * rather than values blinking in place. Shared by the 2D cell rail (shared
 * `layoutId`) and the 3D block stage (per-block spring targets).
 *
 * Matching between the previous step and this one, in order of confidence:
 *   1. same position + same value  → element stayed put
 *   2. same value elsewhere        → element moved (a swap/sort) — id follows it
 *   3. leftover ids, in order      → an in-place mutation — id keeps its slot,
 *                                     the value flashes
 *   4. brand-new id                → an appended element
 * `dir[i]` is -1/0/+1: which way element i travelled since last step (for the
 * pass-by arc). Refs mutate during render (like QueueView) — safe because the
 * function is idempotent when re-run on an unchanged `items`.
 */
let SLOT_SEQ = 0;
interface Slot {
  id: number;
  value: JsonValue;
}
export function useSlotIds(items: JsonValue[]): { ids: number[]; dir: number[] } {
  const ref = useRef<Slot[]>([]);
  const prev = ref.current;
  const key = (v: JsonValue) => JSON.stringify(v);
  const used = new Array(prev.length).fill(false);
  const ids: (number | null)[] = new Array(items.length).fill(null);

  // 1. keep elements that didn't move
  for (let i = 0; i < items.length; i++) {
    if (i < prev.length && !used[i] && key(prev[i]!.value) === key(items[i]!)) {
      ids[i] = prev[i]!.id;
      used[i] = true;
    }
  }
  // 2. match moved elements by value
  for (let i = 0; i < items.length; i++) {
    if (ids[i] !== null) continue;
    for (let j = 0; j < prev.length; j++) {
      if (!used[j] && key(prev[j]!.value) === key(items[i]!)) {
        ids[i] = prev[j]!.id;
        used[j] = true;
        break;
      }
    }
  }
  // 3/4. leftover ids (in-place mutations), then fresh ids (appends)
  const leftover = prev.filter((_, j) => !used[j]).map((s) => s.id);
  let li = 0;
  for (let i = 0; i < items.length; i++) {
    if (ids[i] === null) ids[i] = li < leftover.length ? leftover[li++]! : SLOT_SEQ++;
  }

  const prevIndex = new Map(prev.map((s, i) => [s.id, i]));
  const dir = ids.map((id, i) => {
    const p = prevIndex.get(id!);
    if (p === undefined || p === i) return 0;
    return i > p ? 1 : -1;
  });

  ref.current = items.map((v, i) => ({ id: ids[i]!, value: v }));
  return { ids: ids as number[], dir };
}
