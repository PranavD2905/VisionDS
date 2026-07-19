import type { ExecutionTrace } from '@visionds/trace-schema';
import { digestTrace } from './digest';
import {
  ExplanationSchema,
  type ExplainOptions,
  type Explainer,
  type Explanation,
} from './types';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export interface GeminiExplainerOptions {
  /** User-supplied API key; callers keep it client-side (e.g. localStorage). */
  apiKey: string;
  model?: string;
  /** Test seam; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

function buildPrompt(trace: ExecutionTrace): string {
  return `You are a patient tutor helping a student debug their DSA solution.
Below is their code, one testcase, and a step-by-step execution trace recorded
by a tracer (the trace is ground truth — never contradict it).

Respond with JSON only, matching:
{"summary": string, "annotations": [{"stepIndex": number, "text": string}]}

- "summary": 2-4 sentences. Say what the code does on this input and, if the
  verdict is not "pass", pinpoint the exact mistake and how to fix it.
- "annotations": 3-12 captions for the most instructive steps. Each text is
  one sentence under 120 characters, present tense, referring to variables by
  name (e.g. "j finds the complement at index 1, but the return uses i twice").
  Use only stepIndex values that appear in the trace. Always annotate the
  divergence step if there is one.

=== code ===
${trace.code}
=== trace ===
${digestTrace(trace)}`;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message?: string };
}

export class GeminiExplainer implements Explainer {
  readonly provider = 'gemini';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: GeminiExplainerOptions) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? DEFAULT_GEMINI_MODEL;
    // bind: calling an unbound fetch with `this` set to the class instance
    // throws "Illegal invocation" in browsers
    this.fetchFn = opts.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  async explain(trace: ExecutionTrace, opts?: ExplainOptions): Promise<Explanation> {
    const res = await this.fetchFn(`${API_BASE}/${this.model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(trace) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      }),
      signal: opts?.signal ?? null,
    });

    const body = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Gemini API error (HTTP ${res.status})`);
    }
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no content');

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Gemini returned malformed JSON');
    }
    const explanation = ExplanationSchema.parse(parsed);
    // drop hallucinated indices; keep the trace authoritative
    return {
      ...explanation,
      annotations: explanation.annotations.filter(
        (a) => a.stepIndex < trace.steps.length,
      ),
    };
  }
}
