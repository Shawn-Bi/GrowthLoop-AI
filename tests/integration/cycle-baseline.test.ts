import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as create } from "@/app/api/experiments/route";
import { POST as generate } from "@/app/api/experiments/[experimentId]/drafts/route";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { POST as analyse } from "@/app/api/experiments/[experimentId]/analysis/route";
import { POST as decideProposalRoute } from "@/app/api/proposals/[proposalId]/decision/route";
import { ingestExperimentMetrics } from "@/lib/controller/workflow";
import { contentDnaSchema } from "@/schemas/content";
import { setupTestDb } from "../persistence/db";
import { controlRow, variantRow } from "../kpi/fixtures";
import { validOutput } from "../analytics/fixtures";

// PR #13 decision 3: the approver's outcome picks the Cycle 2 baseline, and
// the loop stops at MAX_EXPERIMENT_CYCLES (default 2).
const mocks = vi.hoisted(() => ({ db: null as unknown, create: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: () => ({ messages: { create: mocks.create } }), getAnthropicModel: () => "test-model" }));
const getDb = setupTestDb();
const auth = { authorization: "Bearer cycle-baseline-code" };
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...auth },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const exp = (experimentId = "exp_001") => ({ params: Promise.resolve({ experimentId }) });
const proposal = (proposalId = "prop_exp_001_1") => ({ params: Promise.resolve({ proposalId }) });
const brief = { audience: "Nonprofit teams", campaignGoal: "Review a hypothetical product", keyMessage: "GrantReady is hypothetical." };
const approve = (outcome?: string, proposalId = "prop_exp_001_1") =>
  decideProposalRoute(req(`/api/proposals/${proposalId}/decision`, { decision: "approved", reviewer_role: "experiment_approver", ...(outcome ? { outcome } : {}) }), proposal(proposalId));

beforeEach(async () => {
  mocks.db = getDb().db;
  mocks.create.mockReset();
  vi.stubEnv("DEMO_ACCESS_CODE", "cycle-baseline-code");
  vi.spyOn(console, "info").mockImplementation(() => {});
  await getDb().db.claim.create({ data: { id: "clm_ok", registryVersion: "v1", text: "GrantReady is hypothetical.", status: "approved_demo_claim", demoOnly: true, reviewer: "Michelle", reviewedAt: new Date(), sourceOrEvidence: "Approved hypothetical demo" } });
  expect((await create(req("/api/experiments", { hypothesis: "Compare hooks", primary_test_variable: "hook" }))).status).toBe(201);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

// Cycle 1 tests the hook; the Agent suggests the control as the baseline and
// a new CTA for the next cycle. Later cycles' drafts already exist, since
// approving a proposal generates them.
async function analyseCycle(experimentId: string, rows = [controlRow, variantRow]) {
  if (experimentId === "exp_001") {
    expect((await generate(req("/api/experiments/exp_001/drafts", { brief, approved_claim_ids: ["clm_ok"] }), exp())).status).toBe(201);
  }
  const drafts = await getDb().db.contentDraft.findMany({ where: { experimentId }, orderBy: { variantRole: "asc" } });
  for (const item of drafts) {
    const response = await decideDraftRoute(req(`/api/drafts/${item.id}/decision`, { action: "approve", reviewer_role: "content_reviewer" }), { params: Promise.resolve({ draftId: item.id }) });
    expect(response.status).toBe(200);
  }
  await ingestExperimentMetrics(getDb().db, experimentId, rows.map((row) => ({ ...row, experiment_id: experimentId })));
  const output = validOutput();
  output.findings = output.findings.map((finding) => ({ ...finding, metric_ids: finding.metric_ids.map((id) => id.replace("exp_001", experimentId)) }));
  output.proposal.metric_ids = output.proposal.metric_ids.map((id) => id.replace("exp_001", experimentId));
  output.proposal.primary_test_variable = "cta";
  output.proposal.changed_dimensions = ["cta"];
  output.proposal.content_change = { baseline_content_id: drafts[0].id, variant_value: "Which grant-search step would you discuss?" };
  mocks.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } });
  expect((await analyse(req(`/api/experiments/${experimentId}/analysis`), exp(experimentId))).status).toBe(201);
  return drafts;
}

it("refuses to approve without an outcome and writes nothing", async () => {
  await analyseCycle("exp_001");

  const response = await approve();

  expect(response.status).toBe(400);
  expect(await getDb().db.experiment.count()).toBe(1);
  expect(await getDb().db.auditEvent.count({ where: { recordType: "experiment_proposal" } })).toBe(0);
});

it("builds Cycle 2 on the variant when the approver says the variant did better", async () => {
  const [control1, variant1] = await analyseCycle("exp_001");
  const dna1 = [control1, variant1].map((item) => contentDnaSchema.parse(item.contentDna));

  const response = await approve("variant_better");
  expect(response.status, await response.clone().text()).toBe(200);
  const result = await response.json();

  // The approver's outcome replaced the Agent's suggested (control) baseline.
  expect(result.handoff.content_change).toEqual({ baseline_content_id: variant1.id, variant_value: "Which grant-search step would you discuss?" });
  expect(result.proposal.outcome).toBe("variant_better");
  expect(await getDb().db.analysisReport.findUniqueOrThrow({ where: { id: "prop_exp_001_1" } })).toMatchObject({ outcome: "variant_better" });
  expect(await getDb().db.auditEvent.findFirstOrThrow({ where: { recordType: "experiment_proposal" } })).toMatchObject({ outcome: "variant_better" });

  const [control2, variant2] = (await getDb().db.contentDraft.findMany({ where: { experimentId: "exp_002" }, orderBy: { variantRole: "asc" } }))
    .map((item) => contentDnaSchema.parse(item.contentDna));
  // The Cycle 1 winner's hook carries into both Cycle 2 drafts; only the CTA changes.
  expect(control2.hook).toBe(dna1[1].hook);
  expect(control2.hook).not.toBe(dna1[0].hook);
  expect(variant2.hook).toBe(dna1[1].hook);
  expect(variant2.cta).toBe("Which grant-search step would you discuss?");
  expect(control2.cta).toBe(dna1[1].cta);
});

it.each(["control_better", "inconclusive"])("keeps the control as the baseline when the outcome is %s", async (outcome) => {
  const [control1] = await analyseCycle("exp_001");

  const response = await approve(outcome);

  expect(response.status).toBe(200);
  expect((await response.json()).handoff.content_change.baseline_content_id).toBe(control1.id);
});

it("allows only inconclusive when the primary KPI isn't calculable", async () => {
  const zeroVisits = { ...controlRow, landing_page_visits: 0, demo_requests: 0, qualified_demo_requests: 0 };
  const [control1] = await analyseCycle("exp_001", [zeroVisits, variantRow]);

  const refused = await approve("variant_better");
  expect(refused.status).toBe(409);
  expect((await refused.json()).error).toContain("only be recorded as inconclusive");
  expect(await getDb().db.experiment.count()).toBe(1);

  const accepted = await approve("inconclusive");
  expect(accepted.status).toBe(200);
  expect((await accepted.json()).handoff.content_change.baseline_content_id).toBe(control1.id);
});

it("stops the loop after cycle 2 by default and continues when the limit is raised", async () => {
  await analyseCycle("exp_001");
  expect((await approve("inconclusive")).status).toBe(200);
  await analyseCycle("exp_002");

  const stopped = await approve("inconclusive", "prop_exp_002_1");
  expect(stopped.status).toBe(409);
  expect((await stopped.json()).error).toContain("cycle 2 of 2");
  expect(await getDb().db.experiment.count()).toBe(2);
  expect(await getDb().db.analysisReport.findUniqueOrThrow({ where: { id: "prop_exp_002_1" } })).toMatchObject({ status: "needs_human_approval", outcome: null });

  vi.stubEnv("MAX_EXPERIMENT_CYCLES", "3");
  expect((await approve("inconclusive", "prop_exp_002_1")).status).toBe(200);
  expect(await getDb().db.experiment.findUniqueOrThrow({ where: { id: "exp_003" } })).toMatchObject({ cycle: 3, parentExperimentId: "exp_002" });
});
