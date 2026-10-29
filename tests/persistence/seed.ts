import type { PrismaClient } from "@/generated/prisma/client";
import { toProposalRecord } from "@/lib/agents/analytics/proposal";
import { createRootExperiment } from "@/lib/persistence/experiments";
import { saveMetricRecords } from "@/lib/persistence/metrics";
import { saveProposal } from "@/lib/persistence/proposals";
import { metrics, validOutput } from "../analytics/fixtures";
import { drafts } from "../kpi/fixtures";
import { validDna } from "./dna";

// The test-only claim the seeded drafts use (not Michelle's GrantReady copy).
export const SEED_CLAIM_TEXT = "GrantReady is a hypothetical product.";

// Cycle 1 up to a proposal awaiting approval: exp_001, cnt_001/cnt_002 with
// valid Content DNA, the claim they use, their metrics and prop_001.
// Approving prop_001 generates the real Cycle 2 pair from cnt_001.
export async function seedCycle1(db: PrismaClient): Promise<void> {
  await createRootExperiment(db, {
    id: "exp_001",
    correlationId: "corr_001",
    hypothesis: "A question hook earns more qualified demo requests.",
    primaryTestVariable: "hook",
  });
  await db.claim.create({
    data: {
      id: "clm_001",
      registryVersion: "v1",
      text: SEED_CLAIM_TEXT,
      status: "approved_demo_claim",
      sourceOrEvidence: "Test-only demo claim",
      reviewer: "Michelle",
      reviewedAt: new Date("2026-10-21"),
      demoOnly: true,
    },
  });

  for (const draft of drafts) {
    await db.contentDraft.create({
      data: {
        id: draft.content_id,
        experimentId: draft.experiment_id,
        variantRole: draft.variant_role,
        body: `Test ${draft.variant_role} post`,
        contentDna: validDna({
          variant_role: draft.variant_role,
          claim_ids_used: ["clm_001"],
          hook: `Test ${draft.variant_role} hook`,
          evidence: SEED_CLAIM_TEXT,
          generation_context: { ...validDna().generation_context, correlation_id: "corr_001" },
        }),
        claimIdsUsed: ["clm_001"],
        status: "approved",
      },
    });
  }

  await saveMetricRecords(db, metrics);
  await saveProposal(
    db,
    toProposalRecord("prop_001", "exp_001", validOutput(), metrics)
  );
}

export const approveInput = {
  proposalId: "prop_001",
  decision: "approved" as const,
  reviewerRole: "experiment_approver" as const,
  now: new Date("2026-10-23T15:00:00.000Z"),
  next: {
    experimentId: "exp_002",
    taskId: "task_exp_002",
    approvedClaimIds: ["clm_001"],
  },
};
