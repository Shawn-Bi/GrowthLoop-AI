import { describe, expect, it } from "vitest";
import { toProposalRecord } from "@/lib/agents/analytics/proposal";
import { proposalRecordSchema } from "@/schemas/analytics";
import { metrics, validOutput } from "./fixtures";

describe("toProposalRecord", () => {
  it("queues a well-cited analysis for human approval", () => {
    const proposal = toProposalRecord("prop_001", "exp_001", validOutput(), metrics);

    expect(proposal).toMatchObject({
      status: "needs_human_approval",
      errors: [],
      review_flags: [],
      decided_by_role: null,
    });
    expect(proposalRecordSchema.safeParse(proposal).success).toBe(true);
  });

  it("keeps review flags for the approver", () => {
    const output = validOutput();
    output.proposal.changed_dimensions = ["hook", "cta"];

    const proposal = toProposalRecord("prop_001", "exp_001", output, metrics);

    expect(proposal.status).toBe("needs_human_approval");
    expect(proposal.review_flags).toHaveLength(1);
  });

  it("marks analyses with fabricated metric IDs as errors", () => {
    const output = validOutput();
    output.findings[0].metric_ids = ["met_invented"];

    const proposal = toProposalRecord("prop_001", "exp_001", output, metrics);

    expect(proposal).toMatchObject({
      status: "error",
      errors: ["Unknown metric_id: met_invented"],
    });
  });
});
