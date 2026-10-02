import { describe, expect, it } from 'vitest';
import { traceCase } from '../../trace';

describe('Java tracing via JDI', () => {
  it('traces a buggy two-sum end to end', async () => {
    const code = `class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer,Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need)) return new int[]{seen.get(need), seen.get(need)}; // bug
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}`;
    const trace = await traceCase('java', code, { input: '[2,7,11,15]\n9', expected: '[0,1]' });
    expect(trace.language).toBe('java');
    expect(trace.steps.length).toBeGreaterThan(3);

    const locals = trace.steps.flatMap((s) => s.locals);
    const nums = locals.find((v) => v.name === 'nums');
    expect(nums?.kind).toBe('array');
    expect(nums?.value).toEqual([2, 7, 11, 15]);
    expect(locals.some((v) => v.name === 'seen' && v.kind === 'dict')).toBe(true);

    expect(trace.result.verdict).toBe('fail'); // returns [0,0]
    expect(trace.result.actual).toEqual([0, 0]);
    expect(trace.result.divergenceStepIndex).toBeTypeOf('number');
  }, 30_000);

  it('passes a correct solution and returns a List', async () => {
    const code = `class Solution {
    public List<Integer> countRange(int n) {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(i * i);
        return out;
    }
}`;
    const trace = await traceCase('java', code, { input: '4', expected: '[0,1,4,9]' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.steps.flatMap((s) => s.locals).some((v) => v.name === 'out' && v.kind === 'array')).toBe(true);
  }, 30_000);

  it('handles a void in-place solution (reverse an int array)', async () => {
    const code = `class Solution {
    public void reverse(int[] nums) {
        int l = 0, r = nums.length - 1;
        while (l < r) { int t = nums[l]; nums[l] = nums[r]; nums[r] = t; l++; r--; }
    }
}`;
    const trace = await traceCase('java', code, { input: '[1,2,3,4,5]', expected: '[5,4,3,2,1]' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.result.actual).toEqual([5, 4, 3, 2, 1]);
  }, 30_000);

  it('reports a compile error as an error verdict', async () => {
    const trace = await traceCase('java', 'class Solution { public int f(int x){ return y; } }', {
      input: '3',
      expected: '3',
    });
    expect(trace.result.verdict).toBe('error');
    expect(trace.steps).toHaveLength(0);
  }, 30_000);

  it('defaults past a public helper written after the entry, and traces it', async () => {
    const code = `class Solution {
    public int sumOfSquares(int[] nums) {
        int total = 0;
        for (int x : nums) total += square(x);
        return total;
    }
    public int square(int x) {
        return x * x;
    }
}`;
    const trace = await traceCase('java', code, { input: '[1,2,3]', expected: '14' });
    expect(trace.entry).toEqual({ name: 'sumOfSquares', className: 'Solution' });
    expect(trace.result.verdict).toBe('pass');
    expect(new Set(trace.steps.map((s) => s.func))).toEqual(new Set(['sumOfSquares', 'square']));

    // each call of the helper is its own frame, with the entry as caller
    const helperFrames = new Set(trace.steps.filter((s) => s.func === 'square').map((s) => s.frameId));
    expect(helperFrames.size).toBe(3);
    const inHelper = trace.steps.find((s) => s.func === 'square')!;
    expect(inHelper.caller?.func).toBe('sumOfSquares');
    expect(inHelper.caller?.locals.find((v) => v.name === 'nums')?.ref).toMatch(/^j\d+$/);
  }, 30_000);

  it('traces the overload the testcase argument count selects', async () => {
    const code = `class Solution {
    public int solve(int a) {
        return a;
    }
    public int solve(int a, int b) {
        int s = a + b;
        return s;
    }
}`;
    const trace = await traceCase(
      'java',
      code,
      { input: '2\n3', expected: '5' },
      'var result = new Solution().solve(a0, a1);',
    );
    expect(trace.result.verdict).toBe('pass');
    expect(trace.steps.some((s) => s.locals.some((l) => l.name === 'b'))).toBe(true);
  }, 30_000);
});
