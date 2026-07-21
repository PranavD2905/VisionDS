import { describe, expect, it } from 'vitest';
import { traceCase } from './trace';

// A buggy two-sum: returns just one index instead of the pair — a wrong answer,
// not a crash, so the verdict is `fail` with a divergence step to jump to.
const BUGGY_TWO_SUM = `class Solution {
public:
    int twoSum(vector<int>& nums, int target) {
        unordered_map<int,int> seen;
        for (int i = 0; i < (int)nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need)) return seen[need];
            seen[nums[i]] = i;
        }
        return -1;
    }
};`;

describe('C++ tracing via lldb', () => {
  it('traces a buggy two-sum end to end', () => {
    const trace = traceCase('cpp', BUGGY_TWO_SUM, { input: '[2,7,11,15]\n9', expected: '[0,1]' });

    expect(trace.language).toBe('cpp');
    expect(trace.steps.length).toBeGreaterThan(3);

    // nums is recorded as a structured array, i as a scalar
    const firstLocals = trace.steps.flatMap((s) => s.locals);
    const nums = firstLocals.find((v) => v.name === 'nums');
    expect(nums?.kind).toBe('array');
    expect(nums?.value).toEqual([2, 7, 11, 15]);
    expect(firstLocals.some((v) => v.name === 'i' && v.kind === 'scalar')).toBe(true);

    // seen appears as a dict (hash map)
    expect(firstLocals.some((v) => v.name === 'seen' && v.kind === 'dict')).toBe(true);

    // returns a single index 0 -> wrong answer -> fail with a divergence step
    const ret = trace.steps.find((s) => s.event === 'return');
    expect(ret?.returnValue).toBe(0);
    expect(trace.result.verdict).toBe('fail');
    expect(trace.result.divergenceStepIndex).toBeTypeOf('number');
  }, 30_000);

  it('handles a void in-place solution (moveZeroes) by comparing the mutated arg', () => {
    const code = `class Solution {
public:
    void moveZeroes(vector<int>& nums) {
        int slow = 0;
        for (int fast = 0; fast < (int)nums.size(); fast++) {
            if (nums[fast] != 0) { swap(nums[slow], nums[fast]); slow++; }
        }
    }
};`;
    const trace = traceCase('cpp', code, { input: '[0,1,0,3,12]', expected: '[1,3,12,0,0]' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.result.actual).toEqual([1, 3, 12, 0, 0]);
    // nums and the two pointers are all visible
    const names = new Set(trace.steps.flatMap((s) => s.locals.map((l) => l.name)));
    expect(names.has('nums')).toBe(true);
    expect(names.has('slow')).toBe(true);
    expect(names.has('fast')).toBe(true);
  }, 30_000);

  it('binds vector<char> from the signature (reverseString)', () => {
    const code = `class Solution {
public:
    void reverseString(vector<char>& s) {
        int l = 0, r = (int)s.size() - 1;
        while (l < r) { swap(s[l], s[r]); l++; r--; }
    }
};`;
    const trace = traceCase('cpp', code, {
      input: '["h","e","l","l","o"]',
      expected: '["o","l","l","e","h"]',
    });
    expect(trace.result.verdict).toBe('pass');
    const s = trace.steps.flatMap((st) => st.locals).find((l) => l.name === 's');
    expect(s?.kind).toBe('array');
  }, 30_000);

  it('exposes a std::stack as an ordered array (valid parentheses)', () => {
    const code = `class Solution {
public:
    bool isValid(string s) {
        stack<char> st;
        for (char c : s) {
            if (c == '(' || c == '[' || c == '{') st.push(c);
            else {
                if (st.empty()) return false;
                char t = st.top(); st.pop();
                if ((c == ')' && t != '(') || (c == ']' && t != '[') || (c == '}' && t != '{'))
                    return false;
            }
        }
        return st.empty();
    }
};`;
    const trace = traceCase('cpp', code, { input: '"()[]{}"', expected: 'true' });
    expect(trace.result.verdict).toBe('pass');
    const st = trace.steps.flatMap((s) => s.locals).find((l) => l.name === 'st');
    expect(st?.kind).toBe('array');
    expect(Array.isArray(st?.value)).toBe(true);
  }, 30_000);

  it('reports a compile error as an error verdict, not a crash', () => {
    const trace = traceCase('cpp', 'class Solution { public: int f(int x){ return y; } };', {
      input: '3',
      expected: '3',
    });
    expect(trace.result.verdict).toBe('error');
    expect(trace.result.message).toMatch(/error:/);
    expect(trace.steps).toHaveLength(0);
  }, 30_000);
});
