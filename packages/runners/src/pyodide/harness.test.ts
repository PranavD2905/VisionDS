import { MAX_COLLECTION_ITEMS, MAX_STEPS } from '@visionds/trace-schema';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { runCaseInPyodide, type PyodideLike } from './invoke';

let py: PyodideLike;

beforeAll(async () => {
  py = (await loadPyodide()) as unknown as PyodideLike;
}, 120_000);

const TWO_SUM_OK = `def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
`;

const TWO_SUM_BUGGY = `def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, i]
`;

const CASE = { input: 'nums = [3,2,4]\ntarget = 6', expected: '[1,2]' };

describe('harness.py via pyodide', () => {
  it('passes a correct two-sum', () => {
    const trace = runCaseInPyodide(py, TWO_SUM_OK, CASE);
    expect(trace.result.verdict).toBe('pass');
    expect(trace.result.actual).toEqual([1, 2]);
    expect(trace.result.divergenceStepIndex).toBeUndefined();
    expect(trace.steps.length).toBeGreaterThan(5);
    expect(trace.steps[0]!.event).toBe('call');
    expect(trace.steps.at(-1)!.event).toBe('return');
  });

  it('fails a buggy two-sum with divergence at the wrong return', () => {
    const trace = runCaseInPyodide(py, TWO_SUM_BUGGY, CASE);
    expect(trace.result.verdict).toBe('fail');
    expect(trace.result.actual).toEqual([1, 1]);
    const div = trace.result.divergenceStepIndex!;
    const step = trace.steps[div]!;
    expect(step.event).toBe('return');
    expect(step.callDepth).toBe(0);
    expect(step.returnValue).toEqual([1, 1]);
  });

  it('records locals snapshots with kinds', () => {
    const trace = runCaseInPyodide(py, TWO_SUM_OK, CASE);
    const mid = trace.steps[Math.floor(trace.steps.length / 2)]!;
    const nums = mid.locals.find((v) => v.name === 'nums');
    expect(nums).toMatchObject({ kind: 'array', value: [3, 2, 4] });
    const target = mid.locals.find((v) => v.name === 'target');
    expect(target).toMatchObject({ kind: 'scalar', value: 6 });
  });

  it('supports LeetCode class Solution style', () => {
    const code = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
`;
    const trace = runCaseInPyodide(py, code, CASE);
    expect(trace.result.verdict).toBe('pass');
    const anyDict = trace.steps.some((s) =>
      s.locals.some((v) => v.name === 'seen' && v.kind === 'dict'),
    );
    expect(anyDict).toBe(true);
  });

  it('reports an exception with divergence at the raising step', () => {
    const code = `def solve(nums, target):
    return nums[10] + target
`;
    const trace = runCaseInPyodide(py, code, CASE);
    expect(trace.result.verdict).toBe('error');
    expect(trace.result.message).toContain('IndexError');
    const step = trace.steps[trace.result.divergenceStepIndex!]!;
    expect(step.event).toBe('exception');
    expect(step.exception?.type).toBe('IndexError');
  });

  it('truncates an infinite loop at the step cap', () => {
    const trace = runCaseInPyodide(
      py,
      'def solve(nums, target):\n    while True:\n        pass\n',
      CASE,
    );
    expect(trace.result.verdict).toBe('timeout');
    expect(trace.truncated).toBe(true);
    expect(trace.steps.length).toBeLessThanOrEqual(MAX_STEPS);
    expect(trace.result.divergenceStepIndex).toBe(trace.steps.length - 1);
  }, 30_000);

  it('caps huge collection snapshots', () => {
    const code = `def solve(nums, target):
    big = list(range(1000))
    return target
`;
    const trace = runCaseInPyodide(py, code, { input: CASE.input, expected: '6' });
    expect(trace.result.verdict).toBe('pass');
    const withBig = trace.steps.find((s) => s.locals.some((v) => v.name === 'big'))!;
    const big = withBig.locals.find((v) => v.name === 'big')!;
    expect(big.truncated).toBe(true);
    // capped items plus the ellipsis marker
    expect((big.value as unknown[]).length).toBe(MAX_COLLECTION_ITEMS + 1);
  });

  it('captures stdout cumulatively', () => {
    const code = `def solve(nums, target):
    print("hello")
    print("world")
    return target
`;
    const trace = runCaseInPyodide(py, code, { input: CASE.input, expected: '6' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.steps.at(-1)!.stdout).toBe('hello\nworld\n');
  });

  it('rejects unparseable input with a clear error', () => {
    const trace = runCaseInPyodide(py, TWO_SUM_OK, {
      input: 'not a ((( literal',
      expected: '[1,2]',
    });
    expect(trace.result.verdict).toBe('error');
    expect(trace.result.message).toContain('could not parse');
    expect(trace.steps).toHaveLength(0);
  });

  it('treats matrices as their own kind', () => {
    const code = `def solve(grid, target):
    return grid[0][0]
`;
    const trace = runCaseInPyodide(py, code, {
      input: '[[1,2],[3,4]]\n6',
      expected: '1',
    });
    expect(trace.result.verdict).toBe('pass');
    const grid = trace.steps[0]!.locals.find((v) => v.name === 'grid');
    expect(grid?.kind).toBe('matrix');
  });
});
