import type { AnalyticsOutput, ProposalRecord } from "@/schemas/analytics";
import type { MetricRecord } from "@/schemas/metrics";
import { reviewAnalysis } from "./review";

// Wraps a schema-valid agent output as a proposal awaiting the human
// experiment approver, or as an error proposal that can never be approved.
export function toProposalRecord(
  proposalId: string,
  experimentId: string,
  output: AnalyticsOutput,
  metrics: MetricRecord[]
): ProposalRecord {
  const review = reviewAnalysis(output, metrics);

  return {
    proposal_id: proposalId,
    experiment_id: experimentId,
    analysis: output,
    status: review.ok ? "needs_human_approval" : "error",
    errors: review.ok ? [] : review.errors,
    review_flags: review.ok ? review.review_flags : [],
    decided_by_role: null,
    decided_at: null,
  };
}
