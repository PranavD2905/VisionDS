import { varKey, type ExecutionTrace, type TraceStep } from '@visionds/trace-schema';
import { describe, expect, it } from 'vitest';
import { inferShapes } from './shapes';

let index = 0;
const step = (func: string, frameId: number, path: number[]): TraceStep => ({
  index: index++,
  line: 1,
  event: 'line',
  locals: [{ name: 'path', kind: 'array', value: path }],
  func,
  frameId,
  stdout: '',
  callDepth: frameId,
});
const trace = (steps: TraceStep[]) => ({ steps }) as unknown as ExecutionTrace;

describe('inferShapes across frames', () => {
  it('builds stack evidence across recursive frames without diffing one frame against another', () => {
    index = 0;
    // each recursion level pushes onto its own copy, then pops it on the way out
    const shapes = inferShapes(
      trace([
        step('dfs', 0, []),
        step('dfs', 0, [1]),
        step('dfs', 1, [1, 2, 3, 4]), // a deeper frame's unrelated list: no evidence
        step('dfs', 1, [1, 2, 3, 4, 5]),
        step('dfs', 0, [1, 7]),
        step('dfs', 0, [1]),
      ]),
    );
    expect(shapes.get(varKey('dfs', 'path'))).toBe('stack');
  });

  it('keeps a helper’s list from disqualifying the caller’s same-named stack', () => {
    index = 0;
    const shapes = inferShapes(
      trace([
        step('solve', 0, [1]),
        step('solve', 0, [1, 2]),
        step('fill', 1, [9, 9, 9]),
        step('fill', 1, [8, 9, 9]), // random-access write: disqualifies `fill`'s path only
        step('solve', 0, [1]),
      ]),
    );
    expect(shapes.get(varKey('solve', 'path'))).toBe('stack');
    expect(shapes.has(varKey('fill', 'path'))).toBe(false);
  });
});
