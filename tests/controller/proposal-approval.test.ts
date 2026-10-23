import { describe, expect, it } from "vitest";
import { TransitionError } from "@/lib/controller/errors";
import { decideProposal } from "@/lib/controller/proposal-approval";
import { auditEventSchema } from "@/schemas/audit";
import { pendingProposal } from "../analytics/fixtures";

const now = new Date("2026-10-23T15:00:00.000Z");

function expectTransitionError(fn: () => unknown, httpStatus: 403 | 409) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(TransitionError);
    expect((error as TransitionError).httpStatus).toBe(httpStatus);
    return;
  }
  throw new Error("Expected a TransitionError");
}

describe("decideProposal", () => {
  it("approves a pending proposal and records an audit event", () => {
    const pending = pendingProposal();
    const { proposal, audit } = decideProposal(
      pending,
      "approved",
      "experiment_approver",
      now
    );

    expect(proposal).toMatchObject({
      status: "approved",
      decided_by_role: "experiment_approver",
      decided_at: "2026-10-23T15:00:00.000Z",
    });
    expect(audit).toEqual({
      event_type: "approval_decision",
      record_type: "experiment_proposal",
      record_id: "prop_001",
      decision: "approved",
      reviewer_role: "experiment_approver",
      from_status: "needs_human_approval",
      to_status: "approved",
      occurred_at: "2026-10-23T15:00:00.000Z",
    });
    expect(auditEventSchema.safeParse(audit).success).toBe(true);
    expect(pending.status).toBe("needs_human_approval");
  });

  it("rejects a pending proposal", () => {
    const { proposal } = decideProposal(
      pendingProposal(),
      "rejected",
      "experiment_approver",
      now
    );

    expect(proposal.status).toBe("rejected");
  });

  it("refuses decisions from the content reviewer role with 403", () => {
    expectTransitionError(
      () =>
        decideProposal(pendingProposal(), "approved", "content_reviewer", now),
      403
    );
  });

  it("refuses a second decision with 409", () => {
    const { proposal } = decideProposal(
      pendingProposal(),
      "approved",
      "experiment_approver",
      now
    );

    expectTransitionError(
      () => decideProposal(proposal, "approved", "experiment_approver", now),
      409
    );
  });

  it("refuses to approve a proposal in error with 409", () => {
    const errored = {
      ...pendingProposal(),
      status: "error" as const,
      errors: ["Unknown metric_id: met_invented"],
    };

    expectTransitionError(
      () => decideProposal(errored, "approved", "experiment_approver", now),
      409
    );
  });
});
