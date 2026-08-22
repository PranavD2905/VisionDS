import { describe, expect, it } from 'vitest';
import { dedupeEntries, resolveEntryPick } from './resolve';

const FREE = { name: 'foo', className: null };
const METHOD = { name: 'foo', className: 'Solution' };

describe('resolveEntryPick', () => {
  it('distinguishes a free function from a same-named method', () => {
    // Regression: matching on name alone made the second option unselectable —
    // the picker regenerated the first and the controlled select snapped back.
    expect(resolveEntryPick([FREE, METHOD], METHOD)).toBe(METHOD);
    expect(resolveEntryPick([FREE, METHOD], FREE)).toBe(FREE);
  });

  it('still self-corrects a stale override whose class is wrong', () => {
    // A pick carried over from another language (Python's className: null)
    // must resolve to this code's real entry, not be trusted blindly.
    expect(resolveEntryPick([METHOD], { name: 'foo', className: null })).toBe(METHOD);
  });

  it('takes the last match, agreeing with the last-def detector rule', () => {
    const first = { name: 'f', className: 'Solution', id: 1 };
    const last = { name: 'f', className: 'Solution', id: 2 };
    // Java overloads collapse to one wire identity; seed and adapter must pick
    // the same one or a run invokes a different method than it was built for.
    expect(resolveEntryPick([first, last], { name: 'f', className: 'Solution' })).toBe(last);
  });

  it('treats a candidate with no className concept as an exact name match', () => {
    const javaLike = { name: 'f', returnType: 'int', params: [] };
    expect(resolveEntryPick([javaLike], { name: 'f', className: 'Solution' })).toBe(javaLike);
  });

  it('returns undefined for no override and for an unknown name', () => {
    expect(resolveEntryPick([FREE], undefined)).toBeUndefined();
    expect(resolveEntryPick([FREE], { name: 'nope', className: null })).toBeUndefined();
  });
});

describe('dedupeEntries', () => {
  it('keeps distinct name/class pairs', () => {
    expect(dedupeEntries([FREE, METHOD])).toEqual([FREE, METHOD]);
  });

  it('collapses duplicates to the last, matching resolveEntryPick', () => {
    const a = { name: 'f', className: 'Solution', id: 1 };
    const b = { name: 'f', className: 'Solution', id: 2 };
    expect(dedupeEntries([a, b])).toEqual([b]);
  });
});
