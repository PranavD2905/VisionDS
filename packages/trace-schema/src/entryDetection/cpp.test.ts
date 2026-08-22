import { describe, expect, it } from 'vitest';
import { findCppEntry, listCppEntryCandidates } from './cpp';

describe('listCppEntryCandidates', () => {
  it('does not double-count a Solution method as a bogus top-level function', () => {
    // Regression: scanning the whole source for free functions (instead of
    // the source with the Solution class body blanked out) picked up every
    // method a second time with className: null, producing a false
    // "ambiguous entry point" — and if that bogus candidate got selected,
    // the generated call omitted `Solution().`, which fails to compile.
    const code = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need))
                return {seen[need], seen[need]};
            seen[nums[i]] = i;
        }
        return {};
    }
};
`;
    expect(listCppEntryCandidates(code)).toEqual([{ name: 'twoSum', className: 'Solution' }]);
    expect(findCppEntry(code)).toEqual({ name: 'twoSum', className: 'Solution' });
  });

  it('still detects genuine ambiguity: a Solution method plus a real top-level function', () => {
    const code = `int helper(int x) {
    return x + 1;
}

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        return {0, 1};
    }
};
`;
    expect(listCppEntryCandidates(code)).toEqual([
      { name: 'twoSum', className: 'Solution' },
      { name: 'helper', className: null },
    ]);
    // The default still prefers the Solution method.
    expect(findCppEntry(code)).toEqual({ name: 'twoSum', className: 'Solution' });
  });

  it('does not double-count when the Solution class has multiple methods', () => {
    const code = `class Solution {
public:
    int helper(int x) { return x + 1; }
    vector<int> twoSum(vector<int>& nums, int target) { return {0, 1}; }
};
`;
    expect(listCppEntryCandidates(code)).toEqual([
      { name: 'helper', className: 'Solution' },
      { name: 'twoSum', className: 'Solution' },
    ]);
  });
});
