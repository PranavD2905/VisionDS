import { describe, expect, it } from 'vitest';
import { buildCallTree, isOpenAt } from './callTree';
import type { TraceStep } from './schema';

type StepRow = Omit<TraceStep, 'index' | 'locals' | 'stdout'> & {
  locals?: TraceStep['locals'];
  stdout?: string;
};

function steps(rows: StepRow[]): TraceStep[] {
  return rows.map((r, index) => ({
    index,
    stdout: '',
    locals: [],
    ...r,
  })) as TraceStep[];
}

const arg = (name: string, value: number) =>
  [{ name, kind: 'scalar' as const, value }];

describe('buildCallTree', () => {
  it('nests frames from call/return events', () => {
    // fib(2) -> fib(1) + fib(0)
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'call', callDepth: 0, func: 'fib', locals: arg('n', 2) },
        { line: 2, event: 'call', callDepth: 1, func: 'fib', locals: arg('n', 1) },
        { line: 3, event: 'return', callDepth: 1, func: 'fib', returnValue: 1 },
        { line: 2, event: 'call', callDepth: 1, func: 'fib', locals: arg('n', 0) },
        { line: 3, event: 'return', callDepth: 1, func: 'fib', returnValue: 0 },
        { line: 3, event: 'return', callDepth: 0, func: 'fib', returnValue: 1 },
      ]),
    );
    expect(tree.roots).toEqual([0]);
    expect(tree.nodes).toHaveLength(3);
    expect(tree.nodes[0]!.children).toEqual([1, 2]);
    expect(tree.nodes[1]!.depth).toBe(1);
    expect(tree.nodes[1]!.args[0]!.value).toBe(1);
    expect(tree.nodes[1]!.returnValue).toBe(1);
    expect(tree.nodes[2]!.returnValue).toBe(0);
    expect(tree.maxDepth).toBe(1);
    expect(tree.recursive).toEqual(['fib']);
  });

  it('reports no recursion for a flat run', () => {
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'call', callDepth: 0, func: 'twoSum' },
        { line: 2, event: 'line', callDepth: 0, func: 'twoSum' },
        { line: 3, event: 'return', callDepth: 0, func: 'twoSum', returnValue: [0, 1] },
      ]),
    );
    expect(tree.recursive).toEqual([]);
    expect(tree.nodes).toHaveLength(1);
  });

  it('flags mutual recursion on every function in the cycle', () => {
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'call', callDepth: 0, func: 'isEven' },
        { line: 2, event: 'call', callDepth: 1, func: 'isOdd' },
        { line: 3, event: 'call', callDepth: 2, func: 'isEven' },
      ]),
    );
    expect([...tree.recursive].sort()).toEqual(['isEven', 'isOdd']);
  });

  it('derives frames from callDepth when the runner emits only line events', () => {
    // what the lldb / JDI steppers produce
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'line', callDepth: 0, func: 'solve' },
        { line: 2, event: 'line', callDepth: 1, func: 'solve' },
        { line: 3, event: 'line', callDepth: 2, func: 'solve' },
        { line: 4, event: 'line', callDepth: 1, func: 'solve' },
        { line: 5, event: 'line', callDepth: 0, func: 'solve' },
      ]),
    );
    expect(tree.nodes).toHaveLength(3);
    expect(tree.maxDepth).toBe(2);
    expect(tree.recursive).toEqual(['solve']);
    expect(tree.nodes[2]!.returned).toBe(true);
  });

  it('splits sibling calls that share a depth', () => {
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'line', callDepth: 0, func: 'main' },
        { line: 2, event: 'line', callDepth: 1, func: 'left' },
        { line: 3, event: 'line', callDepth: 1, func: 'right' },
      ]),
    );
    expect(tree.nodes.map((n) => n.func)).toEqual(['main', 'left', 'right']);
    expect(tree.nodes[0]!.children).toEqual([1, 2]);
  });

  it('leaves frames open when the trace was cut short', () => {
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'call', callDepth: 0, func: 'f' },
        { line: 2, event: 'call', callDepth: 1, func: 'f' },
      ]),
    );
    expect(tree.nodes[1]!.returned).toBe(false);
    expect(tree.nodes[1]!.exitStep).toBeUndefined();
    expect(isOpenAt(tree.nodes[1]!, 99)).toBe(true);
    expect(isOpenAt(tree.nodes[1]!, 0)).toBe(false);
  });

  it('attaches an exception to the frame that raised it', () => {
    const tree = buildCallTree(
      steps([
        { line: 1, event: 'call', callDepth: 0, func: 'f' },
        {
          line: 2,
          event: 'exception',
          callDepth: 0,
          func: 'f',
          exception: { type: 'RecursionError', message: 'too deep' },
        },
      ]),
    );
    expect(tree.nodes[0]!.exception?.type).toBe('RecursionError');
  });
});
