import type { ExecutionTrace, TraceStep, VarSnapshot } from '../schema';

const CODE = `def twoSum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, i]  # bug: should be [i, j]
`;

const NUMS = [3, 2, 4];
const TARGET = 6;

function locals(vars: Record<string, number | number[]>): VarSnapshot[] {
  return Object.entries(vars).map(([name, value]) =>
    Array.isArray(value)
      ? { name, kind: 'array', value }
      : { name, kind: 'scalar', value },
  );
}

function step(
  index: number,
  line: number,
  event: TraceStep['event'],
  vars: Record<string, number | number[]>,
  extra?: Partial<TraceStep>,
): TraceStep {
  return { index, line, event, locals: locals(vars), stdout: '', callDepth: 0, ...extra };
}

const base = { nums: NUMS, target: TARGET };

/**
 * Hand-written trace of a buggy two-sum (returns [i, i] instead of [i, j])
 * run on nums=[3,2,4], target=6. Used to prove the visualizer UI before any
 * real execution exists, and as a known-good input for analyze/schema tests.
 */
export const twoSumFailTrace: ExecutionTrace = {
  language: 'python',
  code: CODE,
  testCase: { input: '[3,2,4]\n6', expected: '[1,2]' },
  steps: [
    step(0, 1, 'call', base),
    step(1, 2, 'line', base),
    step(2, 3, 'line', { ...base, i: 0 }),
    step(3, 4, 'line', { ...base, i: 0, j: 1 }),
    step(4, 3, 'line', { ...base, i: 0, j: 1 }),
    step(5, 4, 'line', { ...base, i: 0, j: 2 }),
    step(6, 3, 'line', { ...base, i: 0, j: 2 }),
    step(7, 2, 'line', { ...base, i: 0, j: 2 }),
    step(8, 3, 'line', { ...base, i: 1, j: 2 }),
    step(9, 4, 'line', { ...base, i: 1, j: 2 }),
    step(10, 5, 'line', { ...base, i: 1, j: 2 }),
    step(11, 5, 'return', { ...base, i: 1, j: 2 }, { returnValue: [1, 1] }),
  ],
  result: {
    input: '[3,2,4]\n6',
    expected: '[1,2]',
    actual: [1, 1],
    verdict: 'fail',
    divergenceStepIndex: 11,
  },
};
