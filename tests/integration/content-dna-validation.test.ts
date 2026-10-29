import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as create } from "@/app/api/experiments/route";
import { POST as generate } from "@/app/api/experiments/[experimentId]/drafts/route";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { POST as analyse } from "@/app/api/experiments/[experimentId]/analysis/route";
import { POST as decideProposalRoute } from "@/app/api/proposals/[proposalId]/decision/route";
import { ingestExperimentMetrics } from "@/lib/controller/workflow";
import { setupTestDb } from "../persistence/db";
import { controlRow, variantRow } from "../kpi/fixtures";
import { validOutput } from "../analytics/fixtures";

// PR #6 and #12: missing or invalid Content DNA fields stop a draft from
// being approved or marked ready, and an invalid baseline stops Cycle 2.
const mocks = vi.hoisted(() => ({ db: null as unknown, create: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: () => ({ messages: { create: mocks.create } }), getAnthropicModel: () => "test-model" }));
const getDb = setupTestDb();
const auth = { authorization: "Bearer dna-validation-code" };
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...auth },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const exp = (experimentId = "exp_001") => ({ params: Promise.resolve({ experimentId }) });
const brief = { audience: "Nonprofit teams", campaignGoal: "Review a hypothetical product", keyMessage: "GrantReady is hypothetical." };
const decide = (id: string, action: string) =>
  decideDraftRoute(req(`/api/drafts/${id}/decision`, { action, reviewer_role: "content_reviewer" }), { params: Promise.resolve({ draftId: id }) });

beforeEach(async () => {
  mocks.db = getDb().db;
  mocks.create.mockReset();
  vi.stubEnv("DEMO_ACCESS_CODE", "dna-validation-code");
  vi.spyOn(console, "info").mockImplementation(() => {});
  await getDb().db.claim.create({ data: { id: "clm_ok", registryVersion: "v1", text: "GrantReady is hypothetical.", status: "approved_demo_claim", demoOnly: true, reviewer: "Michelle", reviewedAt: new Date(), sourceOrEvidence: "Approved hypothetical demo" } });
  expect((await create(req("/api/experiments", { hypothesis: "Compare hooks", primary_test_variable: "hook" }))).status).toBe(201);
  expect((await generate(req("/api/experiments/exp_001/drafts", { brief, approved_claim_ids: ["clm_ok"] }), exp())).status).toBe(201);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function drafts() {
  return getDb().db.contentDraft.findMany({ where: { experimentId: "exp_001" }, orderBy: { variantRole: "asc" } });
}
async function editDna(id: string, edit: (dna: Record<string, unknown>) => void) {
  const row = await getDb().db.contentDraft.findUniqueOrThrow({ where: { id } });
  const dna = structuredClone(row.contentDna) as Record<string, unknown>;
  edit(dna);
  await getDb().db.contentDraft.update({ where: { id }, data: { contentDna: dna as object } });
}

it("approves drafts whose generated Content DNA is valid", async () => {
  for (const item of await drafts()) expect((await decide(item.id, "approve")).status).toBe(200);
});

it.each([
  ["a missing field", (dna: Record<string, unknown>) => { delete dna.hook; }, "hook"],
  ["an unsupported schema version", (dna: Record<string, unknown>) => { dna.schema_version = "2.0"; }, "schema_version"],
  ["an unknown channel", (dna: Record<string, unknown>) => { dna.channel = "tiktok"; }, "channel"],
  ["an unexpected extra field", (dna: Record<string, unknown>) => { dna.messaging_angle = "new"; }, "(whole record)"],
])("refuses to approve a draft with %s and changes nothing", async (_label, edit, field) => {
  const [control] = await drafts();
  await editDna(control.id, edit);

  const response = await decide(control.id, "approve");

  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain(field);
  expect((await getDb().db.contentDraft.findUniqueOrThrow({ where: { id: control.id } })).status).toBe("pending_approval");
  expect(await getDb().db.auditEvent.count()).toBe(0);
});

it("refuses Content DNA that disagrees with the draft's role or claim IDs", async () => {
  const [control, variant] = await drafts();
  await editDna(control.id, (dna) => { dna.variant_role = "variant"; });
  await editDna(variant.id, (dna) => { dna.claim_ids_used = ["clm_other"]; });

  for (const id of [control.id, variant.id]) {
    const response = await decide(id, "approve");
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("doesn't match its variant role or claim IDs");
  }
});

it("refuses to mark a draft ready once its Content DNA became invalid", async () => {
  const [control] = await drafts();
  expect((await decide(control.id, "approve")).status).toBe(200);
  await editDna(control.id, (dna) => { dna.cta = ""; });

  const response = await decide(control.id, "mark_ready");

  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("cta");
  expect((await getDb().db.contentDraft.findUniqueOrThrow({ where: { id: control.id } })).status).toBe("approved");
});

// Cycle 1 approved and analysed; the Agent suggests the control as baseline.
async function analyseCycle1() {
  const pair = await drafts();
  for (const item of pair) expect((await decide(item.id, "approve")).status).toBe(200);
  await ingestExperimentMetrics(getDb().db, "exp_001", [controlRow, variantRow]);
  const output = validOutput();
  output.proposal.primary_test_variable = "cta";
  output.proposal.changed_dimensions = ["cta"];
  output.proposal.content_change = { baseline_content_id: pair[0].id, variant_value: "Which grant-search step would you discuss?" };
  mocks.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } });
  expect((await analyse(req("/api/experiments/exp_001/analysis"), exp())).status).toBe(201);
  return pair;
}
const approveProposal = () => decideProposalRoute(
  req("/api/proposals/prop_exp_001_1/decision", { decision: "approved", reviewer_role: "experiment_approver", outcome: "inconclusive" }),
  { params: Promise.resolve({ proposalId: "prop_exp_001_1" }) }
);
// Nothing from the refused approval may remain: no child experiment, handoff,
// child drafts or proposal audit event, and the proposal still awaits a decision.
async function expectNothingAdvanced() {
  expect(await getDb().db.experiment.count()).toBe(1);
  expect(await getDb().db.handoff.count()).toBe(0);
  expect(await getDb().db.contentDraft.count({ where: { experimentId: { not: "exp_001" } } })).toBe(0);
  expect(await getDb().db.auditEvent.count({ where: { recordType: "experiment_proposal" } })).toBe(0);
  expect((await getDb().db.analysisReport.findUniqueOrThrow({ where: { id: "prop_exp_001_1" } })).status).toBe("needs_human_approval");
  expect((await getDb().db.experiment.findUniqueOrThrow({ where: { id: "exp_001" } })).status).toBe("open");
}

it("rolls back the proposal approval when the Cycle 2 baseline's Content DNA is invalid", async () => {
  const pair = await analyseCycle1();
  // The approved control draft's stored DNA is damaged after approval.
  await editDna(pair[0].id, (dna) => { delete dna.pain_point; });

  const response = await approveProposal();

  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("invalid Content DNA (pain_point)");
  await expectNothingAdvanced();
});

// Michelle's finding on #12/#16/#17: approval used to skip Cycle 2 generation
// when the baseline DNA had no schema_version, and committed a child
// experiment and handoff without drafts.
it.each([
  ["without schema_version", (dna: Record<string, unknown>) => { delete dna.schema_version; }, "schema_version"],
  ["that is empty", (dna: Record<string, unknown>) => { for (const key of Object.keys(dna)) delete dna[key]; }, "schema_version"],
  ["in the old { hook } shape", (dna: Record<string, unknown>) => { for (const key of Object.keys(dna)) if (key !== "hook") delete dna[key]; }, "schema_version"],
])("refuses approval and rolls back when the baseline DNA is %s", async (_label, edit, field) => {
  const pair = await analyseCycle1();
  await editDna(pair[0].id, edit);

  const response = await approveProposal();

  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain(field);
  await expectNothingAdvanced();
});

it("approves with a valid baseline and always creates both Cycle 2 drafts", async () => {
  await analyseCycle1();

  const response = await approveProposal();

  expect(response.status).toBe(200);
  expect(await getDb().db.contentDraft.findMany({ where: { experimentId: "exp_002" }, select: { variantRole: true, status: true }, orderBy: { variantRole: "asc" } }))
    .toEqual([{ variantRole: "control", status: "pending_approval" }, { variantRole: "variant", status: "pending_approval" }]);
});
