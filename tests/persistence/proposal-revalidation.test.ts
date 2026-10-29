import { beforeEach, expect, it } from "vitest";
import { TransitionError } from "@/lib/controller/errors";
import { decideProposalAndAdvance } from "@/lib/persistence/experiments";
import type { AnalyticsOutput } from "@/schemas/analytics";
import { setupTestDb, type TestDb } from "./db";
import { approveInput, seedCycle1 } from "./seed";

// PR #7 review: approval re-runs the Analytics review on the stored
// proposal, so an edited row can't advance the loop.
const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(async () => {
  testDb = getTestDb();
  await seedCycle1(testDb.db);
});

async function editStoredAnalysis(edit: (analysis: AnalyticsOutput) => void) {
  const row = await testDb.db.analysisReport.findUniqueOrThrow({ where: { id: "prop_001" } });
  const analysis = structuredClone(row.analysis) as AnalyticsOutput;
  edit(analysis);
  await testDb.db.analysisReport.update({ where: { id: "prop_001" }, data: { analysis: analysis as object } });
}

async function expectRefusedAndNothingWritten(message: string | RegExp) {
  const error = await decideProposalAndAdvance(testDb.db, approveInput).then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(TransitionError);
  expect((error as TransitionError).httpStatus).toBe(409);
  expect((error as TransitionError).message).toMatch(message);
  expect(await testDb.db.experiment.count()).toBe(1);
  expect(await testDb.db.handoff.count()).toBe(0);
  expect(await testDb.db.auditEvent.count()).toBe(0);
  expect((await testDb.db.analysisReport.findUniqueOrThrow({ where: { id: "prop_001" } })).status).toBe("needs_human_approval");
}

it("refuses to approve a stored proposal edited to cite an unknown metric ID", async () => {
  await editStoredAnalysis((analysis) => { analysis.findings[0].metric_ids = ["met_invented"]; });

  await expectRefusedAndNothingWritten("Unknown metric_id: met_invented");
});

it("refuses to approve a stored proposal edited to change two variables", async () => {
  await editStoredAnalysis((analysis) => { analysis.proposal.changed_dimensions = ["hook", "cta"]; });

  // Later PRs (#14) also refuse this in decideProposal, with its own wording.
  await expectRefusedAndNothingWritten(/one-variable/i);
});

it("refuses to approve a stored proposal citing another experiment's metrics", async () => {
  await editStoredAnalysis((analysis) => { analysis.proposal.metric_ids = ["met_test_fixture_exp_999_control_qualified_demo_rate_per_visit"]; });

  await expectRefusedAndNothingWritten("Unknown metric_id");
});

it("still approves an unedited proposal", async () => {
  const result = await decideProposalAndAdvance(testDb.db, approveInput);

  expect(result.proposal.status).toBe("approved");
});
