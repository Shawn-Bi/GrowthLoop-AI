import { describe, expect, it } from "vitest";
import { buildNextCycleHandoff } from "@/lib/controller/build-handoff";
import { TransitionError } from "@/lib/controller/errors";
import { decideProposal } from "@/lib/controller/proposal-approval";
import { handoffSchema } from "@/schemas/handoff";
import {
  controlPrimary,
  pendingProposal,
  variantPrimary,
} from "../analytics/fixtures";

const approved = decideProposal(
  pendingProposal(),
  "approved",
  "experiment_approver",
  new Date("2026-10-23T15:00:00.000Z")
).proposal;

const input = {
  proposal: approved,
  sourceContentIds: ["cnt_001", "cnt_002"],
  approvedClaimIds: ["clm_001"],
  nextExperimentId: "exp_002",
  taskId: "task_002",
  correlationId: "corr_001",
};

describe("buildNextCycleHandoff", () => {
  it("links the next experiment to the approved findings of its parent", () => {
    const handoff = buildNextCycleHandoff(input);

    expect(handoff).toMatchObject({
      schema_version: "1.1",
      content_change: approved.analysis.proposal.content_change,
      experiment_id: "exp_002",
      parent_experiment_id: "exp_001",
      source_content_ids: ["cnt_001", "cnt_002"],
      approved_claim_ids: ["clm_001"],
      primary_test_variable: "hook",
      metric_ids: [controlPrimary, variantPrimary],
      approval_state: "approved",
      next_action: "generate_content_drafts",
      idempotency_key: "handoff:prop_001",
    });
    expect(handoff.findings).toEqual(approved.analysis.findings);
  });

  it("chains beyond cycle 2 for a continuing loop", () => {
    const analysis = structuredClone(approved.analysis);
    analysis.proposal.content_change.baseline_content_id = "cnt_003";
    const cycle3 = buildNextCycleHandoff({
      ...input,
      proposal: { ...approved, proposal_id: "prop_002", experiment_id: "exp_002", analysis },
      sourceContentIds: ["cnt_003", "cnt_004"],
      nextExperimentId: "exp_003",
    });

    expect(cycle3).toMatchObject({
      experiment_id: "exp_003",
      parent_experiment_id: "exp_002",
      idempotency_key: "handoff:prop_002",
    });
  });

  it("gives a retried request the same idempotency key", () => {
    expect(buildNextCycleHandoff(input).idempotency_key).toBe(
      buildNextCycleHandoff({ ...input, taskId: "task_retry" }).idempotency_key
    );
  });

  it.each(["needs_human_approval", "rejected", "error"] as const)(
    "refuses a %s proposal with 409",
    (status) => {
      expect(() =>
        buildNextCycleHandoff({
          ...input,
          proposal: { ...approved, status },
        })
      ).toThrow(TransitionError);
    }
  );

  it("refuses a next experiment that is its own parent", () => {
    expect(() =>
      buildNextCycleHandoff({ ...input, nextExperimentId: "exp_001" })
    ).toThrow("An experiment can't be its own parent.");
  });
});

describe("handoffSchema", () => {
  const valid = buildNextCycleHandoff(input);

  it("rejects a handoff missing a required field", () => {
    const missing: Record<string, unknown> = { ...valid };
    delete missing.task_id;

    expect(handoffSchema.safeParse(missing).success).toBe(false);
  });

  it.each(["1.0", "2.0"])("rejects schema version %s", (schema_version) => {
    expect(
      handoffSchema.safeParse({ ...valid, schema_version }).success
    ).toBe(false);
  });

  it("requires content_change once a parent is set", () => {
    const missing: Record<string, unknown> = { ...valid };
    delete missing.content_change;

    const result = handoffSchema.safeParse(missing);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["content_change"]);
  });

  it("requires the baseline to be one of the source drafts", () => {
    const result = handoffSchema.safeParse({
      ...valid,
      content_change: { ...valid.content_change!, baseline_content_id: "cnt_999" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["content_change", "baseline_content_id"]);
  });

  it("allows a cycle 1 handoff without parent evidence", () => {
    expect(
      handoffSchema.safeParse({
        ...valid,
        experiment_id: "exp_001",
        parent_experiment_id: null,
        source_content_ids: [],
        metric_ids: [],
        findings: [],
      }).success
    ).toBe(true);
  });

  it("requires parent evidence once a parent is set", () => {
    const result = handoffSchema.safeParse({ ...valid, findings: [] });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["findings"]);
  });
});
