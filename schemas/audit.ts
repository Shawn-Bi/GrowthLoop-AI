import { z } from "zod";

// Role labels recorded for audit. They are selected demo roles, not verified
// identities (PRD fixed operating policy).
export const reviewerRoleSchema = z.enum([
  "content_reviewer",
  "experiment_approver",
]);
export type ReviewerRole = z.infer<typeof reviewerRoleSchema>;

export const decisionSchema = z.enum(["approved", "rejected"]);
export type Decision = z.infer<typeof decisionSchema>;

// The experiment approver's reading of a cycle's result, required to approve
// a proposal. It picks the next baseline; the system never picks a winner.
export const proposalOutcomeSchema = z.enum([
  "control_better",
  "variant_better",
  "inconclusive",
]);
export type ProposalOutcome = z.infer<typeof proposalOutcomeSchema>;

export const auditEventSchema = z.object({
  event_type: z.literal("approval_decision"),
  record_type: z.enum(["content_draft", "experiment_proposal"]),
  record_id: z.string().min(1),
  decision: decisionSchema,
  reviewer_role: reviewerRoleSchema,
  from_status: z.string().min(1),
  to_status: z.string().min(1),
  // Approved experiment proposals only.
  outcome: proposalOutcomeSchema.optional(),
  occurred_at: z.iso.datetime(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
