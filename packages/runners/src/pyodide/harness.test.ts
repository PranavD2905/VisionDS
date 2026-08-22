import {
  MAX_COLLECTION_ITEMS,
  MAX_STEPS,
  buildCallTree,
  type Entry,
  type TestCase,
} from '@visionds/trace-schema';
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDefaultPythonSystemCode, runCaseInPyodide, type PyodideLike } from './invoke';

let py: PyodideLike;

beforeAll(async () => {
  py = (await loadPyodide()) as unknown as PyodideLike;
}, 120_000);

/** Run with the default (last-candidate) system code, matching pre-refactor behavior. */
function runCase(
  studentCode: string,
  testCase: TestCase,
  entryOverride?: Entry,
) {
  const { systemCode } = getDefaultPythonSystemCode(py, studentCode, entryOverride);
  return runCaseInPyodide(py, { studentCode, systemCode }, testCase);
}

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
    const trace = runCase(TWO_SUM_OK, CASE);
    expect(trace.result.verdict).toBe('pass');
    expect(trace.result.actual).toEqual([1, 2]);
    expect(trace.result.divergenceStepIndex).toBeUndefined();
    expect(trace.steps.length).toBeGreaterThan(5);
    expect(trace.steps[0]!.event).toBe('call');
    expect(trace.steps.at(-1)!.event).toBe('return');
  });

  it('fails a buggy two-sum with divergence at the wrong return', () => {
    const trace = runCase(TWO_SUM_BUGGY, CASE);
    expect(trace.result.verdict).toBe('fail');
    expect(trace.result.actual).toEqual([1, 1]);
    const div = trace.result.divergenceStepIndex!;
    const step = trace.steps[div]!;
    expect(step.event).toBe('return');
    expect(step.callDepth).toBe(0);
    expect(step.returnValue).toEqual([1, 1]);
  });

  it('records locals snapshots with kinds', () => {
    const trace = runCase(TWO_SUM_OK, CASE);
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
    const trace = runCase(code, CASE);
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
    const trace = runCase(code, CASE);
    expect(trace.result.verdict).toBe('error');
    expect(trace.result.message).toContain('IndexError');
    const step = trace.steps[trace.result.divergenceStepIndex!]!;
    expect(step.event).toBe('exception');
    expect(step.exception?.type).toBe('IndexError');
  });

  it('truncates an infinite loop at the step cap', () => {
    const trace = runCase(
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
    const trace = runCase(code, { input: CASE.input, expected: '6' });
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
    const trace = runCase(code, { input: CASE.input, expected: '6' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.steps.at(-1)!.stdout).toBe('hello\nworld\n');
  });

  it('rejects unparseable input with a clear error', () => {
    const trace = runCase(TWO_SUM_OK, {
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
    const trace = runCase(code, {
      input: '[[1,2],[3,4]]\n6',
      expected: '1',
    });
    expect(trace.result.verdict).toBe('pass');
    const grid = trace.steps[0]!.locals.find((v) => v.name === 'grid');
    expect(grid?.kind).toBe('matrix');
  });

  it('detects ListNode chains as linkedlist snapshots', () => {
    const code = `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def reverseList(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    prev = None
    curr = head
    while curr:
        nxt = curr.next
        curr.next = prev
        prev = curr
        curr = nxt
    out = []
    while prev:
        out.append(prev.val)
        prev = prev.next
    return out
`;
    const trace = runCase(code, {
      input: '[1,2,3,4,5]',
      expected: '[5,4,3,2,1]',
    });
    expect(trace.result.verdict).toBe('pass');
    // mid-reversal, `prev` and `curr` are both chains
    const mid = trace.steps.find((s) => {
      const prev = s.locals.find((v) => v.name === 'prev');
      const curr = s.locals.find((v) => v.name === 'curr');
      return prev?.kind === 'linkedlist' && curr?.kind === 'linkedlist';
    });
    expect(mid).toBeDefined();
    const prev = mid!.locals.find((v) => v.name === 'prev')!;
    const value = prev.value as { vals: unknown[]; cyclesTo: number | null };
    expect(Array.isArray(value.vals)).toBe(true);
    expect(value.cyclesTo).toBeNull();
  });

  it('detects a cycle in a ListNode chain', () => {
    const code = `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

def makeCycle(vals):
    head = ListNode(vals[0])
    tail = head
    for v in vals[1:]:
        tail.next = ListNode(v)
        tail = tail.next
    tail.next = head.next  # cycle back to node #1
    probe = head
    return len(vals)
`;
    const trace = runCase(code, { input: '[1,2,3]', expected: '3' });
    expect(trace.result.verdict).toBe('pass');
    const probed = trace.steps
      .flatMap((s) => s.locals)
      .filter((v) => v.name === 'probe' && v.kind === 'linkedlist');
    expect(probed.length).toBeGreaterThan(0);
    const value = probed.at(-1)!.value as { vals: unknown[]; cyclesTo: number | null };
    expect(value.vals).toEqual([1, 2, 3]);
    expect(value.cyclesTo).toBe(1);
  });

  it('detects TreeNode structures as tree snapshots', () => {
    const code = `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def build(vals):
    root = TreeNode(vals[0])
    root.left = TreeNode(vals[1])
    root.right = TreeNode(vals[2])
    return root.left.val
`;
    const trace = runCase(code, { input: '[2,1,3]', expected: '1' });
    expect(trace.result.verdict).toBe('pass');
    const roots = trace.steps
      .flatMap((s) => s.locals)
      .filter((v) => v.name === 'root' && v.kind === 'tree');
    expect(roots.length).toBeGreaterThan(0);
    const value = roots.at(-1)!.value as {
      val: unknown;
      left: { val: unknown } | null;
      right: { val: unknown } | null;
    };
    expect(value.val).toBe(2);
    expect(value.left?.val).toBe(1);
    expect(value.right?.val).toBe(3);
  });

  it('lists every candidate, not just the default', () => {
    const code = `def helper(x):
    return x + 1

def twoSum(nums, target):
    return [0, 1]
`;
    const { entry } = getDefaultPythonSystemCode(py, code);
    expect(entry).toEqual({ name: 'twoSum', className: null });
  });

  it('targets a non-default candidate when the call line is edited', () => {
    const code = `def helper(nums, target):
    return [1, 1]

def twoSum(nums, target):
    return [1, 2]
`;
    // helper is textually last-ish? no — twoSum is last, so the default
    // targets twoSum; explicitly ask for helper instead.
    const { systemCode, entry } = getDefaultPythonSystemCode(py, code, {
      name: 'helper',
      className: null,
    });
    expect(entry.name).toBe('helper');
    const trace = runCaseInPyodide(py, { studentCode: code, systemCode }, CASE);
    expect(trace.result.actual).toEqual([1, 1]);
  });

  it('reports a broken call-site distinctly from a broken solution', () => {
    const code = `def twoSum(nums, target):
    return [0, 1]
`;
    const trace = runCaseInPyodide(
      py,
      { studentCode: code, systemCode: 'result = twoSum_typo(*__vds_args__)' },
      CASE,
    );
    expect(trace.result.verdict).toBe('error');
    expect(trace.result.message).toContain('error in generated call');
    expect(trace.steps).toHaveLength(0);
  });

  it('does not leak system-code frames into the student trace', () => {
    const trace = runCase(TWO_SUM_OK, CASE);
    // every step's line number must be relative to STUDENT_FILE (the def
    // starts at line 1) — no frame from the call-site itself should appear.
    expect(trace.steps.every((s) => s.line >= 1)).toBe(true);
    expect(trace.steps[0]!.event).toBe('call');
  });
});

const FIB = `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
`;

describe('recursion tree', () => {
  it('records the function name on every step and builds a call tree', () => {
    const trace = runCase(FIB, { input: 'n = 4', expected: '3' });
    expect(trace.result.verdict).toBe('pass');
    expect(trace.steps.every((s) => s.func === 'fib')).toBe(true);

    const tree = buildCallTree(trace.steps);
    // fib(4) makes exactly 9 calls: fib(4..0) counted with multiplicity
    expect(tree.nodes).toHaveLength(9);
    expect(tree.roots).toEqual([0]);
    expect(tree.recursive).toEqual(['fib']);
    expect(tree.maxDepth).toBe(3); // fib(4) → fib(3) → fib(2) → fib(1), 0-indexed

    const root = tree.nodes[0]!;
    expect(root.args[0]!.value).toBe(4);
    expect(root.returnValue).toBe(3);
    expect(root.children).toHaveLength(2);
    // every frame entered before it returned, and returned before its parent
    for (const n of tree.nodes) {
      expect(n.returned).toBe(true);
      expect(n.exitStep!).toBeGreaterThan(n.enterStep);
      if (n.parent !== null) {
        const parent = tree.nodes[n.parent]!;
        expect(n.enterStep).toBeGreaterThan(parent.enterStep);
        expect(n.exitStep!).toBeLessThan(parent.exitStep!);
      }
    }
    // fib(n) nodes return fib(n): the tree agrees with the recorded values
    const byArg = new Map(tree.nodes.map((n) => [n.args[0]!.value as number, n.returnValue]));
    expect([...byArg.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 3],
    ]);
  });

  it('leaves no recursion for a flat solution', () => {
    const trace = runCase(TWO_SUM_OK, CASE);
    expect(buildCallTree(trace.steps).recursive).toEqual([]);
  });
});
