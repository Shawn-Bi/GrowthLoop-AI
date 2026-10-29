import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsRunResult } from "@/lib/agents/analytics/run";
import { ControllerError } from "@/lib/controller/errors";
import {
  decideExperimentProposal,
  ingestExperimentMetrics,
  runExperimentAnalysis,
  type AnalyticsAgentRunner,
} from "@/lib/controller/workflow";
import { createRootExperiment } from "@/lib/persistence/experiments";
import { reserveGenerationSlot } from "@/lib/persistence/quota";
import { validOutput } from "../analytics/fixtures";
import { controlRow, drafts, variantRow } from "../kpi/fixtures";
import { setupTestDb, type TestDb } from "../persistence/db";
import { validDna } from "../persistence/dna";

const now = new Date("2026-10-23T15:00:00.000Z");

const run = {
  agent: "analytics" as const,
  model: "test-model",
  attempts: 1,
  input_tokens: 100,
  output_tokens: 50,
  latency_ms: 1200,
  stop_reason: "end_turn",
};

const agentOk: AnalyticsAgentRunner = async () => ({
  ok: true,
  output: validOutput(),
  run: { ...run, status: "completed", error: null },
});

const agentFails: AnalyticsAgentRunner = async (): Promise<AnalyticsRunResult> => ({
  ok: false,
  error: "The model declined the request (category: cyber).",
  run: { ...run, status: "error", stop_reason: "refusal", error: "declined" },
});

async function expectStatus(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(ControllerError);
  expect((error as ControllerError).httpStatus).toBe(status);
  return error as ControllerError;
}

const getTestDb = setupTestDb();
let testDb: TestDb;

// exp_001 with both drafts approved for publication, but no metrics yet.
beforeEach(async () => {
  testDb = getTestDb();
  await createRootExperiment(testDb.db, {
    id: "exp_001",
    correlationId: "corr_001",
    hypothesis: "h",
    primaryTestVariable: "hook",
  });
  for (const draft of drafts) {
    await testDb.db.contentDraft.create({
      data: {
        id: draft.content_id,
        experimentId: "exp_001",
        variantRole: draft.variant_role,
        body: "post",
        contentDna: { hook: draft.variant_role },
        claimIdsUsed: [],
        status: "approved",
      },
    });
  }
});

describe("ingestExperimentMetrics", () => {
  it("stores metrics for this experiment and ignores other experiments' rows", async () => {
    const otherExperiment = { ...controlRow, experiment_id: "exp_002" };
    const broken = { ...variantRow, demo_requests: 999 };

    const result = await ingestExperimentMetrics(testDb.db, "exp_001", [
      otherExperiment,
      controlRow,
      broken,
      variantRow,
    ]);

    expect(result.saved).toBe(14);
    expect(result.ignored_rows).toBe(1);
    // Indices refer to the original fixture rows.
    expect(result.quarantined).toEqual([
      expect.objectContaining({
        index: 2,
        reasons: ["demo_requests (999) exceeds landing_page_visits (240)"],
      }),
    ]);
  });

  it("quarantines rows for drafts that weren't approved for publication", async () => {
    await testDb.db.contentDraft.update({
      where: { id: "cnt_002" },
      data: { status: "needs_review" },
    });

    const result = await ingestExperimentMetrics(testDb.db, "exp_001", [controlRow, variantRow]);

    expect(result.saved).toBe(7);
    expect(result.quarantined.map((row) => row.index)).toEqual([1]);
  });

  it("refuses a second dataset for the same experiment", async () => {
    await ingestExperimentMetrics(testDb.db, "exp_001", [controlRow, variantRow]);

    await expectStatus(
      ingestExperimentMetrics(testDb.db, "exp_001", [
        { ...controlRow, dataset_id: "another_dataset" },
      ]),
      409
    );
  });

  it("rejects a fixture that isn't an array", async () => {
    await expectStatus(ingestExperimentMetrics(testDb.db, "exp_001", {}), 400);
  });

  it("returns 404 for an unknown experiment", async () => {
    await expectStatus(ingestExperimentMetrics(testDb.db, "exp_404", []), 404);
  });
});

describe("runExperimentAnalysis", () => {
  it("needs stored metrics first", async () => {
    const agent = vi.fn(agentOk);

    await expectStatus(runExperimentAnalysis(testDb.db, agent, "exp_001", now), 409);
    expect(agent).not.toHaveBeenCalled();
  });

  describe("with metrics", () => {
    beforeEach(async () => {
      await ingestExperimentMetrics(testDb.db, "exp_001", [controlRow, variantRow]);
    });

    it("queues the agent's proposal, logs the run and uses a quota slot", async () => {
      const agent = vi.fn(agentOk);

      const proposal = await runExperimentAnalysis(testDb.db, agent, "exp_001", now);

      expect(proposal).toMatchObject({
        proposal_id: "prop_exp_001_1",
        status: "needs_human_approval",
      });
      expect(agent.mock.calls[0][0].metrics).toHaveLength(14);
      expect(agent.mock.calls[0][0].drafts).toEqual([
        { content_id: "cnt_001", variant_role: "control", content_dna: { hook: "control" } },
        { content_id: "cnt_002", variant_role: "variant", content_dna: { hook: "variant" } },
      ]);
      expect(await testDb.db.agentRun.count({ where: { status: "completed" } })).toBe(1);
      expect(await testDb.db.dailyGenerationQuota.findUnique({ where: { day: "2026-10-23" } }))
        .toMatchObject({ successfulCalls: 1 });
    });

    it("refuses a second run while a proposal awaits approval", async () => {
      await runExperimentAnalysis(testDb.db, agentOk, "exp_001", now);

      await expectStatus(runExperimentAnalysis(testDb.db, agentOk, "exp_001", now), 409);
    });

    it("reports agent failures as 502, logs them and gives the slot back", async () => {
      const error = await expectStatus(
        runExperimentAnalysis(testDb.db, agentFails, "exp_001", now),
        502
      );

      expect(error.message).toContain("declined");
      expect(await testDb.db.agentRun.count({ where: { status: "error" } })).toBe(1);
      expect(await testDb.db.analysisReport.count()).toBe(0);
      expect(await testDb.db.dailyGenerationQuota.findUnique({ where: { day: "2026-10-23" } }))
        .toMatchObject({ successfulCalls: 0 });
    });

    it("gives the slot back when the agent call throws", async () => {
      const agent: AnalyticsAgentRunner = async () => {
        throw new TypeError("bug");
      };

      await expect(runExperimentAnalysis(testDb.db, agent, "exp_001", now)).rejects.toThrow("bug");
      expect(await testDb.db.dailyGenerationQuota.findUnique({ where: { day: "2026-10-23" } }))
        .toMatchObject({ successfulCalls: 0 });
    });

    it("returns 429 without calling the agent once the daily cap is used", async () => {
      for (let i = 0; i < 30; i++) {
        await reserveGenerationSlot(testDb.db, now);
      }
      const agent = vi.fn(agentOk);

      await expectStatus(runExperimentAnalysis(testDb.db, agent, "exp_001", now), 429);
      expect(agent).not.toHaveBeenCalled();
    });
  });
});

describe("decideExperimentProposal", () => {
  beforeEach(async () => {
    await ingestExperimentMetrics(testDb.db, "exp_001", [controlRow, variantRow]);
    await runExperimentAnalysis(testDb.db, agentOk, "exp_001", now);
    await testDb.db.claim.createMany({
      data: [
        { id: "clm_002", registryVersion: "v1", text: "b", status: "approved_demo_claim", sourceOrEvidence: "demo", reviewer: "Michelle", reviewedAt: now, demoOnly: true },
        { id: "clm_001", registryVersion: "v1", text: "a", status: "verified_claim", sourceOrEvidence: "doc", reviewer: "Michelle", reviewedAt: now, demoOnly: false },
        { id: "clm_003", registryVersion: "v1", text: "c", status: "rejected_claim", sourceOrEvidence: "none", reviewer: "Michelle", reviewedAt: now, demoOnly: true },
      ],
    });
  });

  it("approval starts exp_002 with only approved or verified claims", async () => {
    // The next cycle keeps the baseline draft's claims, and approval now
    // generates the Cycle 2 pair from its Content DNA, so the baseline needs
    // valid DNA that uses only usable claims (clm_003 is rejected).
    await testDb.db.contentDraft.update({
      where: { id: "cnt_001" },
      data: {
        claimIdsUsed: ["clm_001", "clm_002"],
        contentDna: validDna({ claim_ids_used: ["clm_001", "clm_002"], evidence: "a b" }),
      },
    });
    const result = await decideExperimentProposal(
      testDb.db, "prop_exp_001_1", "approved", "experiment_approver", now, "inconclusive"
    );

    expect(result.handoff).toMatchObject({
      experiment_id: "exp_002",
      parent_experiment_id: "exp_001",
      task_id: "task_exp_002",
      approved_claim_ids: ["clm_001", "clm_002"],
    });
  });

  it("rejection leaves the experiment open for another analysis", async () => {
    await decideExperimentProposal(testDb.db, "prop_exp_001_1", "rejected", "experiment_approver", now);

    const second = await runExperimentAnalysis(testDb.db, agentOk, "exp_001", now);
    expect(second.proposal_id).toBe("prop_exp_001_2");
  });

  it("returns 404 for an unknown proposal", async () => {
    await expectStatus(
      decideExperimentProposal(testDb.db, "prop_missing", "approved", "experiment_approver", now),
      404
    );
  });
});
