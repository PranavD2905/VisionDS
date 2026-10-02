import { describe, expect, it } from 'vitest';
import { inferPointerRoles } from './analyze';
import { aliasesOf, previousInFrame, varKey } from './frames';
import type { ExecutionTrace, TraceStep, VarSnapshot } from './schema';

const v = (name: string, value: VarSnapshot['value'], extra: Partial<VarSnapshot> = {}): VarSnapshot => ({
  name,
  kind: Array.isArray(value) ? 'array' : 'scalar',
  value,
  ...extra,
});

let index = 0;
const step = (func: string, frameId: number, locals: VarSnapshot[], extra: Partial<TraceStep> = {}): TraceStep => ({
  index: index++,
  line: 1,
  event: 'line',
  locals,
  func,
  frameId,
  stdout: '',
  callDepth: 0,
  ...extra,
});

describe('previousInFrame', () => {
  it('skips the steps of other frames', () => {
    index = 0;
    const steps = [
      step('main', 0, [v('nums', [1, 2])]),
      step('helper', 1, [v('nums', [9])]),
      step('main', 0, [v('nums', [1, 2, 3])]),
    ];
    expect(previousInFrame(steps, 2)).toBe(steps[0]);
    expect(previousInFrame(steps, 1)).toBeUndefined(); // the helper's first step
    expect(previousInFrame(steps, 0)).toBeUndefined();
  });

  it('falls back to the previous step when frames are not recorded', () => {
    index = 0;
    const a = { ...step('f', 0, []), frameId: undefined };
    const b = { ...step('f', 0, []), frameId: undefined };
    expect(previousInFrame([a, b], 1)).toBe(a);
  });
});

describe('aliasesOf', () => {
  it('maps a caller value to the name this frame shares it under', () => {
    index = 0;
    const s = step('fill', 1, [v('arr', [1], { ref: 'r1' }), v('k', 2)], {
      caller: {
        func: 'main',
        frameId: 0,
        locals: [v('nums', [1], { ref: 'r1' }), v('other', [5], { ref: 'r2' })],
      },
    });
    expect(aliasesOf(s)).toEqual(new Map([['nums', 'arr']]));
  });
});

describe('inferPointerRoles per function', () => {
  it('infers `i` separately in two functions, each against its own array', () => {
    index = 0;
    const steps = [
      step('outer', 0, [v('grid', [1, 2, 3]), v('i', 0)]),
      step('outer', 0, [v('grid', [1, 2, 3]), v('i', 1)]),
      // the helper's `i` runs far past `grid`'s bounds but stays in `row`'s
      step('inner', 1, [v('row', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), v('i', 0)]),
      step('inner', 1, [v('row', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), v('i', 9)]),
    ];
    const trace = { steps } as unknown as ExecutionTrace;
    const out = inferPointerRoles(trace).steps;
    expect(out[0]!.locals.find((x) => x.name === 'i')!.role).toEqual({ kind: 'index', target: 'grid' });
    expect(out[3]!.locals.find((x) => x.name === 'i')!.role).toEqual({ kind: 'index', target: 'row' });
  });

  it('keys variables by function and name', () => {
    expect(varKey('f', 'i')).not.toBe(varKey('g', 'i'));
    expect(varKey(undefined, 'i')).toBe('::i');
  });
});
