import type { ProposalRecord } from "@/schemas/analytics";
import type { AuditEvent, Decision, ProposalOutcome, ReviewerRole } from "@/schemas/audit";
import { ControllerError, TransitionError } from "./errors";

// Only the experiment approver decides Analytics Agent proposals (PRD fixed
// operating policy), and only while a proposal awaits approval. A repeated
// click hits the 409 branch, so it can't create a second decision.
// Approving also needs the approver's outcome, which picks the next baseline.
export function decideProposal(
  proposal: ProposalRecord,
  decision: Decision,
  reviewerRole: ReviewerRole,
  now: Date,
  outcome?: ProposalOutcome
): { proposal: ProposalRecord; audit: AuditEvent } {
  if (reviewerRole !== "experiment_approver") {
    throw new TransitionError(
      "Only the experiment approver can decide experiment proposals.",
      403
    );
  }

  if (proposal.status !== "needs_human_approval") {
    throw new TransitionError(
      `Proposal ${proposal.proposal_id} is ${proposal.status}, not awaiting approval.`,
      409
    );
  }

  if (decision === "approved" && (proposal.errors.length > 0 ||
      proposal.analysis.proposal.changed_dimensions.length !== 1 ||
      proposal.analysis.proposal.changed_dimensions[0] !== proposal.analysis.proposal.primary_test_variable)) {
    throw new TransitionError("Only a valid one-variable proposal can advance.", 409);
  }
  if (decision === "approved" && !outcome) {
    throw new ControllerError(
      "To approve, record whether the control did better, the variant did better, or the result is inconclusive.",
      400
    );
  }
  const decidedAt = now.toISOString();
  const recorded = decision === "approved" ? outcome : undefined;

  return {
    proposal: {
      ...proposal,
      status: decision,
      decided_by_role: reviewerRole,
      decided_at: decidedAt,
      outcome: recorded ?? null,
    },
    audit: {
      event_type: "approval_decision",
      record_type: "experiment_proposal",
      record_id: proposal.proposal_id,
      decision,
      reviewer_role: reviewerRole,
      from_status: proposal.status,
      to_status: decision,
      ...(recorded ? { outcome: recorded } : {}),
      occurred_at: decidedAt,
    },
  };
}
