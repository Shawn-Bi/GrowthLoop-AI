import { beforeEach, describe, expect, it } from "vitest";
import { TransitionError } from "@/lib/controller/errors";
import { createCycleOneExperiment } from "@/lib/controller/workflow";
import { decideDraft } from "@/lib/persistence/drafts";
import { seedClaimRegistry } from "@/lib/persistence/claims";
import { setupTestDb, type TestDb } from "./db";
import { validDna } from "./dna";

const now = new Date("2026-10-24T09:00:00.000Z");

const getTestDb = setupTestDb();
let testDb: TestDb;

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(TransitionError);
  expect((error as TransitionError).httpStatus).toBe(status);
}

const decide = (draftId: string, action: "approve" | "reject" | "mark_ready") =>
  decideDraft(testDb.db, { draftId, action, reviewerRole: "content_reviewer", now });

beforeEach(async () => {
  testDb = getTestDb();
  await seedClaimRegistry(testDb.db, {
    registry_version: "v1",
    claims: [
      { claim_id: "clm_ok", text: "ok", status: "approved_demo_claim", source_or_evidence: "demo", reviewer: "Michelle", reviewed_at: "2026-10-21", demo_only: true },
      { claim_id: "clm_bad", text: "bad", status: "rejected_claim", source_or_evidence: "none", reviewer: "Michelle", reviewed_at: "2026-10-21", demo_only: true },
    ],
  });
  await createCycleOneExperiment(testDb.db, { hypothesis: "h", primaryTestVariable: "hook" });
  await testDb.db.contentDraft.createMany({
    data: [
      { id: "cnt_001", experimentId: "exp_001", variantRole: "control", body: "Hypothetical product — demonstration only\n\nok", contentDna: validDna(), claimIdsUsed: ["clm_ok"], status: "pending_approval" },
      { id: "cnt_002", experimentId: "exp_001", variantRole: "variant", body: "b", contentDna: validDna({ variant_role: "variant", claim_ids_used: ["clm_ok", "clm_bad"] }), claimIdsUsed: ["clm_ok", "clm_bad"], status: "needs_review" },
    ],
  });
});

describe("decideDraft", () => {
  it("approves a pending draft and records an audit event", async () => {
    const result = await decide("cnt_001", "approve");

    expect(result.draft).toEqual({ content_id: "cnt_001", experiment_id: "exp_001", status: "approved" });
    expect(await testDb.db.contentDraft.findUniqueOrThrow({ where: { id: "cnt_001" } }))
      .toMatchObject({ status: "approved", decidedByRole: "content_reviewer", decidedAt: now });
    expect(await testDb.db.auditEvent.findMany()).toEqual([
      expect.objectContaining({
        recordType: "content_draft",
        recordId: "cnt_001",
        decision: "approved",
        fromStatus: "pending_approval",
        toStatus: "approved",
      }),
    ]);
  });

  it("marks an approved draft ready for manual publication", async () => {
    await decide("cnt_001", "approve");

    const result = await decide("cnt_001", "mark_ready");

    expect(result.draft.status).toBe("ready_for_manual_publication");
    expect(await testDb.db.auditEvent.count()).toBe(2);
  });

  it("never lets an unapproved draft become ready for publication", async () => {
    await expectStatus(decide("cnt_001", "mark_ready"), 409);
    await decide("cnt_001", "reject");
    await expectStatus(decide("cnt_001", "mark_ready"), 409);
  });

  it("blocks approving a draft that uses a rejected claim, and changes nothing", async () => {
    await expectStatus(decide("cnt_002", "approve"), 409);

    expect(await testDb.db.contentDraft.findUniqueOrThrow({ where: { id: "cnt_002" } }))
      .toMatchObject({ status: "needs_review", decidedAt: null });
    expect(await testDb.db.auditEvent.count()).toBe(0);
  });

  it("still lets the reviewer reject that draft", async () => {
    const result = await decide("cnt_002", "reject");

    expect(result.draft.status).toBe("rejected");
  });

  it("refuses a repeated approval with 409 and no second audit event", async () => {
    await decide("cnt_001", "approve");

    await expectStatus(decide("cnt_001", "approve"), 409);
    expect(await testDb.db.auditEvent.count()).toBe(1);
  });

  it("refuses the experiment approver role with 403", async () => {
    await expectStatus(
      decideDraft(testDb.db, { draftId: "cnt_001", action: "approve", reviewerRole: "experiment_approver", now }),
      403
    );
  });

  it("returns 404 for an unknown draft", async () => {
    await expectStatus(decide("cnt_404", "approve"), 404);
  });
});

describe("createCycleOneExperiment", () => {
  it("creates exp_001 once and refuses a second Cycle 1 with 409", async () => {
    expect(await testDb.db.experiment.findUniqueOrThrow({ where: { id: "exp_001" } }))
      .toMatchObject({ cycle: 1, correlationId: "corr_exp_001", primaryTestVariable: "hook", status: "open" });

    await expectStatus(
      createCycleOneExperiment(testDb.db, { hypothesis: "again", primaryTestVariable: "cta" }),
      409
    );
  });
});
