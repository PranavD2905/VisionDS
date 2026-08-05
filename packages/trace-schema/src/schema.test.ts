import { describe, expect, it } from 'vitest';
import { inferPointerRoles } from './analyze';
import { MAX_STEPS, WALL_CLOCK_MS } from './caps';
import { ExecutionTraceSchema } from './schema';
import { twoSumFailTrace } from './fixtures/twoSumFail';

describe('ExecutionTraceSchema', () => {
  it('accepts the canned two-sum fixture', () => {
    expect(() => ExecutionTraceSchema.parse(twoSumFailTrace)).not.toThrow();
  });

  it('rejects an unknown event', () => {
    const bad = structuredClone(twoSumFailTrace) as Record<string, unknown>;
    (bad.steps as { event: string }[])[0]!.event = 'jump';
    expect(ExecutionTraceSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown verdict', () => {
    const bad = structuredClone(twoSumFailTrace) as {
      result: { verdict: string };
    };
    bad.result.verdict = 'maybe';
    expect(ExecutionTraceSchema.safeParse(bad).success).toBe(false);
  });

  it('exports hard caps', () => {
    expect(MAX_STEPS).toBe(10_000);
    expect(WALL_CLOCK_MS).toBe(5_000);
  });
});

describe('inferPointerRoles', () => {
  it('tags i and j as indexes into nums, leaves target alone', () => {
    const analyzed = inferPointerRoles(twoSumFailTrace);
    const last = analyzed.steps.at(-1)!;
    const byName = Object.fromEntries(last.locals.map((v) => [v.name, v]));
    expect(byName.i?.role).toEqual({ kind: 'index', target: 'nums' });
    expect(byName.j?.role).toEqual({ kind: 'index', target: 'nums' });
    expect(byName.target?.role).toBeUndefined();
    expect(byName.nums?.role).toBeUndefined();
  });

  it('does not mutate the input trace', () => {
    const before = JSON.stringify(twoSumFailTrace);
    inferPointerRoles(twoSumFailTrace);
    expect(JSON.stringify(twoSumFailTrace)).toBe(before);
  });
});
