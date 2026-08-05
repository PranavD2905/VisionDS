import { z } from 'zod';

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const VarKindSchema = z.enum([
  'array',
  'dict',
  'set',
  'scalar',
  'string',
  'matrix',
  // pointer-linked structures (server-side runners; e.g. C++ ListNode/TreeNode)
  'linkedlist',
  'tree',
]);
export type VarKind = z.infer<typeof VarKindSchema>;

export const VarRoleSchema = z.object({
  kind: z.literal('index'),
  /** Name of the array-kind local this variable indexes into. */
  target: z.string(),
});
export type VarRole = z.infer<typeof VarRoleSchema>;

export const VarSnapshotSchema = z.object({
  name: z.string(),
  kind: VarKindSchema,
  value: JsonValueSchema,
  truncated: z.boolean().optional(),
  role: VarRoleSchema.optional(),
});
export type VarSnapshot = z.infer<typeof VarSnapshotSchema>;

export const TraceEventSchema = z.enum(['line', 'call', 'return', 'exception']);
export type TraceEvent = z.infer<typeof TraceEventSchema>;

export const TraceStepSchema = z.object({
  index: z.number().int().nonnegative(),
  line: z.number().int().positive(),
  event: TraceEventSchema,
  locals: z.array(VarSnapshotSchema),
  /** stdout produced up to and including this step. */
  stdout: z.string(),
  callDepth: z.number().int().nonnegative(),
  returnValue: JsonValueSchema.optional(),
  exception: z.object({ type: z.string(), message: z.string() }).optional(),
});
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const VerdictSchema = z.enum(['pass', 'fail', 'error', 'timeout']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const TestCaseSchema = z.object({
  input: z.string(),
  expected: z.string(),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

export const TestCaseResultSchema = z.object({
  input: z.string(),
  expected: z.string(),
  actual: JsonValueSchema.optional(),
  verdict: VerdictSchema,
  /**
   * Step where the failure becomes visible: the exception step, or the
   * return step that produced the wrong value. Absent on pass.
   */
  divergenceStepIndex: z.number().int().nonnegative().optional(),
  /** Human-readable detail, e.g. why input parsing failed. */
  message: z.string().optional(),
});
export type TestCaseResult = z.infer<typeof TestCaseResultSchema>;

export const ExecutionTraceSchema = z.object({
  language: z.string(),
  code: z.string(),
  testCase: TestCaseSchema,
  steps: z.array(TraceStepSchema),
  result: TestCaseResultSchema,
  /** True when the step or wall-clock cap cut the trace short. */
  truncated: z.boolean().optional(),
});
export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;
