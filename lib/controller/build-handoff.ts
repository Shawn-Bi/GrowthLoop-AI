import type { ProposalRecord } from "@/schemas/analytics";
import { handoffSchema, type Handoff } from "@/schemas/handoff";
import { TransitionError } from "./errors";

export type NextCycleInput = {
  // Must already be approved by the experiment approver.
  proposal: ProposalRecord;
  // Drafts whose metrics the proposal analysed.
  sourceContentIds: string[];
  approvedClaimIds: string[];
  // Controller-assigned IDs for the new cycle.
  nextExperimentId: string;
  taskId: string;
  correlationId: string;
};

// Turns an approved proposal for cycle N into the handoff that asks the
// Content Agent for cycle N+1 drafts. Works for any cycle, so the loop can
// keep iterating; the MVP demo stops after cycle 2.
export function buildNextCycleHandoff(input: NextCycleInput): Handoff {
  const { proposal } = input;

  if (proposal.status !== "approved") {
    throw new TransitionError(
      `Proposal ${proposal.proposal_id} is ${proposal.status}; only approved proposals start a new cycle.`,
      409
    );
  }

  const { analysis } = proposal;
  const findingMetricIds = analysis.findings.flatMap((f) => f.metric_ids);

  return handoffSchema.parse({
    schema_version: "1.0",
    task_id: input.taskId,
    correlation_id: input.correlationId,
    // One handoff per approved proposal, so a retried request reuses the key
    // and the database unique constraint rejects the duplicate.
    idempotency_key: `handoff:${proposal.proposal_id}`,
    experiment_id: input.nextExperimentId,
    parent_experiment_id: proposal.experiment_id,
    source_content_ids: input.sourceContentIds,
    approved_claim_ids: input.approvedClaimIds,
    hypothesis: analysis.proposal.hypothesis,
    primary_test_variable: analysis.proposal.primary_test_variable,
    control_conditions: analysis.proposal.control_conditions,
    metric_ids: [
      ...new Set([...findingMetricIds, ...analysis.proposal.metric_ids]),
    ],
    findings: analysis.findings,
    uncertainty: analysis.uncertainty,
    approval_state: proposal.status,
    next_action: "generate_content_drafts",
  });
}
