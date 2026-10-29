import { z } from "zod";
import { proposalOutcomeSchema, reviewerRoleSchema } from "./audit";

// Content DNA dimensions a proposal may change (PRD §6). ICP and channel are
// fixed for the MVP, so they are not test variables.
export const testVariableSchema = z.enum([
  "pain_point",
  "hook",
  "value_proposition",
  "evidence",
  "cta",
]);
export type TestVariable = z.infer<typeof testVariableSchema>;

export const findingSchema = z.object({
  statement: z.string().min(1),
  metric_ids: z.array(z.string().min(1)).min(1),
});
export type Finding = z.infer<typeof findingSchema>;

// The concrete edit for the next cycle: which analysed draft to keep as the
// baseline, and the new text for the primary test variable.
export const contentChangeSchema = z.object({
  baseline_content_id: z.string().min(1),
  variant_value: z.string().trim().min(1).max(4000),
});
export type ContentChange = z.infer<typeof contentChangeSchema>;

// What the Analytics & Experiment Agent must return (PRD §3 step 7, §7).
export const analyticsOutputSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(findingSchema).min(1),
  uncertainty: z.string().min(1),
  proposal: z.object({
    hypothesis: z.string().min(1),
    // Required: the next cycle can't start without a concrete change.
    content_change: contentChangeSchema,
    primary_test_variable: testVariableSchema,
    // Every dimension the next drafts would change; must be exactly the
    // primary test variable for a one-variable experiment.
    changed_dimensions: z.array(testVariableSchema).min(1),
    control_conditions: z.array(z.string().min(1)).min(1),
    stop_rule: z.string().min(1),
    metric_ids: z.array(z.string().min(1)).min(1),
  }),
});
export type AnalyticsOutput = z.infer<typeof analyticsOutputSchema>;

export const proposalStatusSchema = z.enum([
  "needs_human_approval",
  "approved",
  "rejected",
  "error",
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const proposalRecordSchema = z.object({
  proposal_id: z.string().min(1),
  // The experiment whose metrics were analysed.
  experiment_id: z.string().min(1),
  analysis: analyticsOutputSchema,
  status: proposalStatusSchema,
  // Blocking problems (status "error"); such proposals can't be approved.
  errors: z.array(z.string()),
  // Non-blocking concerns shown to the human reviewer.
  review_flags: z.array(z.string()),
  decided_by_role: reviewerRoleSchema.nullable(),
  decided_at: z.iso.datetime().nullable(),
  // Set when approved.
  outcome: proposalOutcomeSchema.nullable(),
});
export type ProposalRecord = z.infer<typeof proposalRecordSchema>;
