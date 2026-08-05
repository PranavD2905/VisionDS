import type { ExecutionTrace, TraceStep } from '@visionds/trace-schema';

const MAX_DIGEST_STEPS = 60;
const MAX_VALUE_CHARS = 60;

function fmtStep(step: TraceStep): string {
  const vars = step.locals
    .map((v) => {
      let val = JSON.stringify(v.value) ?? 'null';
      if (val.length > MAX_VALUE_CHARS) val = val.slice(0, MAX_VALUE_CHARS) + '…';
      return `${v.name}=${val}`;
    })
    .join(' ');
  const extra =
    step.event === 'return'
      ? ` -> returns ${JSON.stringify(step.returnValue ?? null)}`
      : step.exception
        ? ` !! ${step.exception.type}: ${step.exception.message}`
        : '';
  return `#${step.index} L${step.line} ${step.event} ${vars}${extra}`;
}

/** Picks which steps the model gets to see: everything for short traces;
 * otherwise the opening, the divergence neighborhood, the ending, and an
 * even sample of the middle. */
export function sampleSteps(trace: ExecutionTrace): TraceStep[] {
  const steps = trace.steps;
  if (steps.length <= MAX_DIGEST_STEPS) return steps;

  const keep = new Set<number>();
  const take = (i: number) => {
    if (i >= 0 && i < steps.length) keep.add(i);
  };
  for (let i = 0; i < 8; i++) take(i);
  for (let i = steps.length - 8; i < steps.length; i++) take(i);
  const div = trace.result.divergenceStepIndex;
  if (div !== undefined) for (let i = div - 5; i <= div + 5; i++) take(i);
  const remaining = MAX_DIGEST_STEPS - keep.size;
  const stride = Math.max(1, Math.floor(steps.length / Math.max(remaining, 1)));
  for (let i = 0; i < steps.length && keep.size < MAX_DIGEST_STEPS; i += stride) take(i);

  return [...keep].sort((a, b) => a - b).map((i) => steps[i]!);
}

/** Compact plain-text digest of a trace for the model prompt. */
export function digestTrace(trace: ExecutionTrace): string {
  const { result } = trace;
  const lines = [
    `language: ${trace.language}`,
    `verdict: ${result.verdict}`,
    `input:\n${result.input}`,
    `expected: ${result.expected}`,
  ];
  if (result.actual !== undefined) lines.push(`actual: ${JSON.stringify(result.actual)}`);
  if (result.message) lines.push(`message: ${result.message}`);
  if (result.divergenceStepIndex !== undefined)
    lines.push(`divergence step index: ${result.divergenceStepIndex}`);
  if (trace.truncated) lines.push('note: trace truncated by execution caps');
  const sampled = sampleSteps(trace);
  lines.push(
    `steps (${sampled.length} of ${trace.steps.length} shown):`,
    ...sampled.map(fmtStep),
  );
  return lines.join('\n');
}
