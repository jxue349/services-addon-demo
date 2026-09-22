import { z } from 'zod';

/**
 * Request and response contracts. Shared by the API routes and the client so
 * both sides agree on shape; this module deliberately imports nothing
 * server-only so it is safe in the client bundle.
 */

export const SPEC_MAX_BYTES = 100 * 1024;
export const QUESTION_MAX_CHARS = 500;
export const MAX_SCENARIO_DEVICES = 10;

/** 100 KB measured in bytes, not code units — the limit is about payload size. */
const specString = z
  .string()
  .min(1, 'Spec is empty')
  .refine((s) => new TextEncoder().encode(s).length <= SPEC_MAX_BYTES, {
    message: `Spec exceeds the ${SPEC_MAX_BYTES / 1024} KB limit`,
  });

// --------------------------------------------------------------------------
// Requests
// --------------------------------------------------------------------------

export const SubscriptionSchema = z.string().min(1).max(80);

export const ScenarioSchema = z.object({
  account: SubscriptionSchema,
  devices: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        subscription: SubscriptionSchema,
      }),
    )
    .max(MAX_SCENARIO_DEVICES, `At most ${MAX_SCENARIO_DEVICES} devices per scenario`),
});

export const ExplorerRequestSchema = z.union([
  z.object({ spec: specString, scenario: ScenarioSchema }),
  z.object({ spec: specString, question: z.string().min(1).max(QUESTION_MAX_CHARS) }),
]);

export const SpecOnlyRequestSchema = z.object({ spec: specString });

/**
 * Declared after TestMatrixSchema below via a getter-free lazy reference would
 * be noise; the test-case shape is small enough to restate for the request
 * boundary, where it only needs to be bounded and rule-citing.
 */
export const ConsistencyRequestSchema = z.object({
  spec: specString,
  testMatrix: z
    .array(
      z.object({
        id: z.string().max(40),
        scenario: z.string().max(2_000),
        expected: z.string().max(2_000),
        priority: z.enum(['P1', 'P2', 'P3']),
        rules: z.array(z.string().max(40)).max(30),
        inPrototype: z.boolean(),
      }),
    )
    .max(40)
    .optional(),
});

export const CommitRequestSchema = z.object({
  content: specString,
  baseSha: z.string().min(1).max(200),
  commitMessage: z.string().min(1).max(500),
  prTitle: z.string().min(1).max(300).optional(),
  prBody: z.string().max(5_000).optional(),
  direct: z.boolean().optional(),
});

// --------------------------------------------------------------------------
// Compiler responses (model output — validated, never trusted)
// --------------------------------------------------------------------------

const ruleIds = z.array(z.string().max(40)).max(30);
const shortText = z.string().max(2_000);

export const ExplorerScenarioResultSchema = z.object({
  accountSummary: shortText,
  devices: z
    .array(
      z.object({
        name: z.string().max(120),
        effectiveEntitlement: z.string().max(200),
        why: shortText,
        rules: ruleIds,
      }),
    )
    .max(MAX_SCENARIO_DEVICES),
  notes: shortText,
});

export const ExplorerWhatIfResultSchema = z.object({
  answer: shortText,
  rules: ruleIds,
  specGap: shortText.nullable(),
});

export const TestMatrixSchema = z.object({
  tests: z
    .array(
      z.object({
        id: z.string().max(40),
        scenario: shortText,
        expected: shortText,
        priority: z.enum(['P1', 'P2', 'P3']),
        rules: ruleIds,
        inPrototype: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
});

export const StateMachineSchema = z.object({
  states: z.array(z.string().max(80)).min(1).max(30),
  transitions: z
    .array(
      z.object({
        from: z.string().max(80),
        to: z.string().max(80),
        event: z.string().max(120),
        rules: ruleIds,
        note: shortText,
      }),
    )
    .max(80),
});

const coverage = z.enum(['covered', 'partial', 'missing']);

export const ConsistencySchema = z.object({
  findings: z
    .array(
      z.object({
        rule: z.string().max(40),
        summary: shortText,
        prototype: coverage,
        qa: z.enum(['covered', 'missing', 'unknown']),
        note: shortText,
      }),
    )
    .max(60),
  headline: shortText,
});

// --------------------------------------------------------------------------
// GitHub responses
// --------------------------------------------------------------------------

export type SpecResponse = {
  content: string;
  sha: string;
  commit: { sha: string; author: string; date: string; message: string };
  htmlUrl: string;
  specPath: string;
  baseBranch: string;
  allowDirectCommit: boolean;
};

export type CommitResponse = {
  mode: 'pull-request' | 'direct';
  prUrl?: string;
  branch: string;
  commitSha: string;
  sha: string;
};

export type HistoryEntry = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
};

// --------------------------------------------------------------------------
// Inferred types
// --------------------------------------------------------------------------

export type Scenario = z.infer<typeof ScenarioSchema>;
export type ExplorerScenarioResult = z.infer<typeof ExplorerScenarioResultSchema>;
export type ExplorerWhatIfResult = z.infer<typeof ExplorerWhatIfResultSchema>;
export type TestMatrix = z.infer<typeof TestMatrixSchema>;
export type TestCase = TestMatrix['tests'][number];
export type StateMachine = z.infer<typeof StateMachineSchema>;
export type Transition = StateMachine['transitions'][number];
export type ConsistencyReport = z.infer<typeof ConsistencySchema>;
export type ConsistencyFinding = ConsistencyReport['findings'][number];
