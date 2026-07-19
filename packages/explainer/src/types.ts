import { z } from 'zod';
import type { ExecutionTrace } from '@visionds/trace-schema';

export const StepAnnotationSchema = z.object({
  stepIndex: z.number().int().nonnegative(),
  text: z.string().min(1),
});
export type StepAnnotation = z.infer<typeof StepAnnotationSchema>;

export const ExplanationSchema = z.object({
  /** 2–4 sentence plain-language account of what the run did and, on
   * failure, exactly what went wrong and how to fix it. */
  summary: z.string().min(1),
  /** Captions for key steps, shown as the student scrubs past them. */
  annotations: z.array(StepAnnotationSchema),
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export interface ExplainOptions {
  signal?: AbortSignal;
}

/**
 * The AI seam, mirroring Runner: providers (Gemini today, others later)
 * turn a finished trace into an optional narration layer. The trace stays
 * ground truth — explanations only decorate it.
 */
export interface Explainer {
  provider: string;
  explain(trace: ExecutionTrace, opts?: ExplainOptions): Promise<Explanation>;
}
