import { twoSumFailTrace } from '@visionds/trace-schema';
import { describe, expect, it, vi } from 'vitest';
import { digestTrace, sampleSteps } from './digest';
import { GeminiExplainer } from './GeminiExplainer';

const okResponse = (payload: unknown) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
    { status: 200 },
  );

describe('digestTrace', () => {
  it('includes verdict, values, and the divergence step', () => {
    const digest = digestTrace(twoSumFailTrace);
    expect(digest).toContain('verdict: fail');
    expect(digest).toContain('expected: [1,2]');
    expect(digest).toContain('actual: [1,1]');
    expect(digest).toContain('divergence step index: 11');
    expect(digest).toContain('#11 L5 return');
    expect(digest).toContain('returns [1,1]');
  });

  it('samples long traces around the divergence', () => {
    const big = {
      ...twoSumFailTrace,
      steps: Array.from({ length: 500 }, (_, i) => ({
        ...twoSumFailTrace.steps[0]!,
        index: i,
      })),
      result: { ...twoSumFailTrace.result, divergenceStepIndex: 250 },
    };
    const sampled = sampleSteps(big);
    expect(sampled.length).toBeLessThanOrEqual(60);
    const indices = sampled.map((s) => s.index);
    expect(indices).toContain(0);
    expect(indices).toContain(250);
    expect(indices).toContain(499);
  });
});

describe('GeminiExplainer', () => {
  it('sends the trace digest and parses a valid response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        summary: 'The return statement uses i twice.',
        annotations: [{ stepIndex: 11, text: 'returns [i, i] instead of [i, j]' }],
      }),
    );
    const explainer = new GeminiExplainer({ apiKey: 'k', fetchFn });
    const result = await explainer.explain(twoSumFailTrace);

    expect(result.summary).toContain('twice');
    expect(result.annotations).toHaveLength(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toContain('gemini-2.5-flash:generateContent');
    expect(init.headers['x-goog-api-key']).toBe('k');
    const body = JSON.parse(init.body);
    expect(body.contents[0].parts[0].text).toContain('verdict: fail');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('drops annotations pointing outside the trace', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        summary: 's',
        annotations: [
          { stepIndex: 2, text: 'fine' },
          { stepIndex: 999, text: 'hallucinated' },
        ],
      }),
    );
    const explainer = new GeminiExplainer({ apiKey: 'k', fetchFn });
    const result = await explainer.explain(twoSumFailTrace);
    expect(result.annotations.map((a) => a.stepIndex)).toEqual([2]);
  });

  it('surfaces API errors with the provider message', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), {
        status: 400,
      }),
    );
    const explainer = new GeminiExplainer({ apiKey: 'bad', fetchFn });
    await expect(explainer.explain(twoSumFailTrace)).rejects.toThrow('API key not valid');
  });

  it('rejects malformed model output', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }),
        { status: 200 },
      ),
    );
    const explainer = new GeminiExplainer({ apiKey: 'k', fetchFn });
    await expect(explainer.explain(twoSumFailTrace)).rejects.toThrow('malformed JSON');
  });
});
