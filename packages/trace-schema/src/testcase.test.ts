import { describe, expect, it } from 'vitest';
import { parseArgs, parseLiteral, parseTestCase, SubmissionError, userErrorTrace } from './testcase';

describe('parseLiteral', () => {
  it.each([
    ['[1, 2, 3]', [1, 2, 3]],
    ['"hi"', 'hi'],
    ['true', true],
    ['null', null],
    ['-4.5e2', -450],
    ['{"a": 1}', { a: 1 }],
  ])('parses JSON %s', (text, value) => {
    expect(parseLiteral(text)).toEqual(value);
  });

  it.each([
    ["['a','b']", ['a', 'b']],
    ['True', true],
    ['False', false],
    ['None', null],
    ['(1, 2)', [1, 2]],
    ['[1, 2,]', [1, 2]],
    ["{'k': [1, None], 2: 'x'}", { k: [1, null], '2': 'x' }],
    ["'it\\'s'", "it's"],
    ['1_000', 1000],
    ['[[1,2],[3,4]]', [[1, 2], [3, 4]]],
  ])('parses the Python literal %s', (text, value) => {
    expect(parseLiteral(text)).toEqual(value);
  });

  it.each(['[1, 2', 'nope', "'unterminated", '[1] 2', ''])('rejects %j as a SubmissionError', (text) => {
    expect(() => parseLiteral(text)).toThrow(SubmissionError);
  });
});

describe('parseArgs', () => {
  it('takes one argument per line and drops `name =` prefixes', () => {
    expect(parseArgs('nums = [2,7,11,15]\ntarget = 9\n')).toEqual([[2, 7, 11, 15], 9]);
  });

  it('skips blank lines and keeps a value that only looks like a comparison', () => {
    expect(parseArgs('\n  [1]\n\n"a==b"\n')).toEqual([[1], 'a==b']);
  });
});

describe('parseTestCase / userErrorTrace', () => {
  it('parses input and expected together', () => {
    expect(parseTestCase({ input: '[1]\n2', expected: "['x']" })).toEqual({
      args: [[1], 2],
      expected: ['x'],
    });
  });

  it('builds a schema-valid error trace that echoes the call site and entry', () => {
    const tc = { input: '1', expected: '1' };
    const trace = userErrorTrace({
      language: 'cpp',
      code: 'int f(int x) { return x; }',
      testCase: tc,
      message: 'nope',
      systemCode: 'auto result = f(a0);',
      entry: { name: 'f', className: null },
    });
    expect(trace.result).toEqual({ ...tc, verdict: 'error', message: 'nope' });
    expect(trace.systemCode).toBe('auto result = f(a0);');
    expect(trace.entry).toEqual({ name: 'f', className: null });
    expect(trace.steps).toEqual([]);
  });
});
