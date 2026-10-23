import type { ProposalRecord } from "@/schemas/analytics";
import type { AuditEvent, Decision, ReviewerRole } from "@/schemas/audit";
import { TransitionError } from "./errors";

// Only the experiment approver decides Analytics Agent proposals (PRD fixed
// operating policy), and only while a proposal awaits approval. A repeated
// click hits the 409 branch, so it can't create a second decision.
export function decideProposal(
  proposal: ProposalRecord,
  decision: Decision,
  reviewerRole: ReviewerRole,
  now: Date
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

  const decidedAt = now.toISOString();

  return {
    proposal: {
      ...proposal,
      status: decision,
      decided_by_role: reviewerRole,
      decided_at: decidedAt,
    },
    audit: {
      event_type: "approval_decision",
      record_type: "experiment_proposal",
      record_id: proposal.proposal_id,
      decision,
      reviewer_role: reviewerRole,
      from_status: proposal.status,
      to_status: decision,
      occurred_at: decidedAt,
    },
  };
}
