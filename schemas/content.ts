import { z } from "zod";
import { testVariableSchema } from "./analytics";

export const contentBriefSchema = z.strictObject({
  audience: z.string().trim().min(1).max(500),
  campaignGoal: z.string().trim().min(1).max(500),
  keyMessage: z.string().trim().min(1).max(2000),
});
export type ContentBrief = z.infer<typeof contentBriefSchema>;
export const contentRequestSchema = z.strictObject({
  brief: contentBriefSchema,
  approved_claim_ids: z.array(z.string().min(1)).min(1)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate claim IDs"),
});
export const dimensionFieldsSchema = z.strictObject({
  pain_point: z.string().min(1), hook: z.string().min(1),
  value_proposition: z.string().min(1), evidence: z.string().min(1), cta: z.string().min(1),
});
// The Content Agent's Cycle 1 output. The variant is the control with one
// value replaced, so the pair can't differ in more than the tested dimension.
export const contentAgentOutputSchema = z.strictObject({
  control: dimensionFieldsSchema,
  variant_value: z.string().trim().min(1).max(4000),
});
export type ContentAgentOutput = z.infer<typeof contentAgentOutputSchema>;
export const contentDnaSchema = dimensionFieldsSchema.extend({
  schema_version: z.literal("1.0"),
  icp: z.string().min(1), channel: z.literal("linkedin_organic"),
  primary_test_variable: testVariableSchema,
  variant_role: z.enum(["control", "variant"]),
  claim_ids_used: z.array(z.string().min(1)).min(1)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate claim IDs"),
  brief: contentBriefSchema,
  // Full approved evidence is retained server-side; logs contain hashes only.
  generation_context: z.object({
    correlation_id: z.string().min(1), experiment_id: z.string().min(1),
    findings: z.array(z.object({ statement: z.string().min(1), metric_ids: z.array(z.string().min(1)).min(1) })),
    metric_ids: z.array(z.string().min(1)),
    approval_state: z.literal("approved"),
    parent_experiment_id: z.string().nullable(),
  }),
});
export type ContentDna = z.infer<typeof contentDnaSchema>;
