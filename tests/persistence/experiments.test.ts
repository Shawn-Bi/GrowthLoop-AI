import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildNextCycleHandoff } from "@/lib/controller/build-handoff";
import { TransitionError } from "@/lib/controller/errors";
import {
  decideProposalAndAdvance,
  loadExperimentTrace,
  loadHandoff,
} from "@/lib/persistence/experiments";
import { loadProposal, saveProposal } from "@/lib/persistence/proposals";
import { pendingProposal } from "../analytics/fixtures";
import { createTestDb, setupTestDb, type TestDb } from "./db";
import { approveInput, seedCycle1 } from "./seed";

async function expectTransition(promise: Promise<unknown>, status: number) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(TransitionError);
  expect((error as TransitionError).httpStatus).toBe(status);
}

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(async () => {
  testDb = getTestDb();
  await seedCycle1(testDb.db);
});

describe("decideProposalAndAdvance", () => {
  it("approves, closes exp_001 and creates exp_002 with its handoff", async () => {
    const { db } = testDb;
    const result = await decideProposalAndAdvance(db, approveInput);

    expect(result.proposal.status).toBe("approved");
    expect(result.handoff).toMatchObject({
      experiment_id: "exp_002",
      parent_experiment_id: "exp_001",
      source_content_ids: ["cnt_001", "cnt_002"],
      correlation_id: "corr_001",
    });

    expect(await db.experiment.findUniqueOrThrow({ where: { id: "exp_001" } }))
      .toMatchObject({ status: "closed" });
    expect(await db.experiment.findUniqueOrThrow({ where: { id: "exp_002" } }))
      .toMatchObject({
        cycle: 2,
        parentExperimentId: "exp_001",
        correlationId: "corr_001",
        primaryTestVariable: "hook",
        status: "open",
      });
    expect(await loadProposal(db, "prop_001")).toMatchObject({
      status: "approved",
      decided_by_role: "experiment_approver",
      decided_at: "2026-10-23T15:00:00.000Z",
    });
    expect(await db.auditEvent.findMany()).toEqual([
      expect.objectContaining({
        recordId: "prop_001",
        decision: "approved",
        reviewerRole: "experiment_approver",
        fromStatus: "needs_human_approval",
        toStatus: "approved",
      }),
    ]);
  });

  it("stores exactly the handoff the controller built", async () => {
    const result = await decideProposalAndAdvance(testDb.db, approveInput);
    const approved = await loadProposal(testDb.db, "prop_001");

    expect(await loadHandoff(testDb.db, "exp_002")).toEqual(result.handoff);
    expect(result.handoff).toEqual(
      buildNextCycleHandoff({
        proposal: approved!,
        sourceContentIds: ["cnt_001", "cnt_002"],
        approvedClaimIds: ["clm_001"],
        nextExperimentId: "exp_002",
        taskId: "task_exp_002",
        correlationId: "corr_001",
      })
    );
  });

  it("refuses a repeated approval without duplicating anything", async () => {
    const { db } = testDb;
    await decideProposalAndAdvance(db, approveInput);

    await expectTransition(decideProposalAndAdvance(db, approveInput), 409);

    expect(await db.experiment.count()).toBe(2);
    expect(await db.handoff.count()).toBe(1);
    expect(await db.auditEvent.count()).toBe(1);
  });

  it("records a rejection without starting a new cycle", async () => {
    const { db } = testDb;
    const result = await decideProposalAndAdvance(db, {
      ...approveInput,
      decision: "rejected",
      next: undefined,
    });

    expect(result).toMatchObject({ handoff: null, proposal: { status: "rejected" } });
    expect(await db.experiment.count()).toBe(1);
    expect(await db.handoff.count()).toBe(0);
    expect(await db.auditEvent.count()).toBe(1);
  });

  it("refuses the content reviewer role with 403 and writes nothing", async () => {
    const { db } = testDb;

    await expectTransition(
      decideProposalAndAdvance(db, {
        ...approveInput,
        reviewerRole: "content_reviewer",
      }),
      403
    );

    expect(await loadProposal(db, "prop_001")).toMatchObject({
      status: "needs_human_approval",
    });
    expect(await db.auditEvent.count()).toBe(0);
  });

  it("refuses an error proposal with 409", async () => {
    await saveProposal(testDb.db, {
      ...pendingProposal(),
      proposal_id: "prop_bad",
      status: "error",
      errors: ["Unknown metric_id: met_invented"],
    });

    await expectTransition(
      decideProposalAndAdvance(testDb.db, {
        ...approveInput,
        proposalId: "prop_bad",
      }),
      409
    );
  });

  it("returns 404 for an unknown proposal", async () => {
    await expectTransition(
      decideProposalAndAdvance(testDb.db, {
        ...approveInput,
        proposalId: "prop_missing",
      }),
      404
    );
  });

  it("rolls back the decision when the next experiment ID is taken", async () => {
    const { db } = testDb;
    await db.experiment.create({
      data: { id: "exp_002", correlationId: "other", cycle: 1 },
    });

    await expectTransition(decideProposalAndAdvance(db, approveInput), 409);

    expect(await loadProposal(db, "prop_001")).toMatchObject({
      status: "needs_human_approval",
    });
    expect(await db.auditEvent.count()).toBe(0);
    expect(await db.experiment.findUniqueOrThrow({ where: { id: "exp_001" } }))
      .toMatchObject({ status: "open" });
  });
});

describe("experiment memory", () => {
  it("reads exp_002's handoff back after a restart", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "growthloop-pglite-"));

    try {
      const first = await createTestDb(dataDir);
      await seedCycle1(first.db);
      const { handoff } = await decideProposalAndAdvance(first.db, approveInput);
      await first.close();

      const restarted = await createTestDb(dataDir);
      const memory = await loadHandoff(restarted.db, "exp_002");
      await restarted.close();

      expect(memory).toEqual(handoff);
      expect(memory?.findings.length).toBeGreaterThan(0);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it("traces exp_001 → drafts → metrics → exp_002", async () => {
    await decideProposalAndAdvance(testDb.db, approveInput);

    const trace = await loadExperimentTrace(testDb.db, "exp_001");

    expect(trace.map((entry) => entry.experiment_id)).toEqual([
      "exp_001",
      "exp_002",
    ]);
    expect(trace[0]).toMatchObject({
      cycle: 1,
      parent_experiment_id: null,
      status: "closed",
      content_ids: ["cnt_001", "cnt_002"],
      proposals: [{ proposal_id: "prop_001", status: "approved" }],
    });
    expect(trace[0].metric_ids).toHaveLength(14);
    // Approval generated the Cycle 2 pair in the same transaction.
    expect(trace[1]).toMatchObject({
      cycle: 2,
      parent_experiment_id: "exp_001",
      content_ids: ["cnt_exp_002_control", "cnt_exp_002_variant"],
    });
  });
});
