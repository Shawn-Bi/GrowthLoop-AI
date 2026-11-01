import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as create } from "@/app/api/experiments/route";
import { POST as generate } from "@/app/api/experiments/[experimentId]/drafts/route";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { POST as analyse } from "@/app/api/experiments/[experimentId]/analysis/route";
import { POST as decideProposalRoute } from "@/app/api/proposals/[proposalId]/decision/route";
import { ingestExperimentMetrics } from "@/lib/controller/workflow";
import { setupTestDb } from "../persistence/db";
import { controlRow, variantRow } from "../kpi/fixtures";
import { validOutput } from "../analytics/fixtures";

// Regression tests for the findings in Michelle's independent reviews of
// #7, #11, #12, #16 and #17. Each case damages stored data the way her
// supplemental tests did, then checks that the workflow refuses it.
const mocks = vi.hoisted(() => ({ db: null as unknown, create: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: () => ({ messages: { create: mocks.create } }), getAnthropicModel: () => "test-model" }));
const getDb = setupTestDb();
const db = () => getDb().db;
const auth = { authorization: "Bearer review-findings-code" };
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...auth },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const exp = (experimentId = "exp_001") => ({ params: Promise.resolve({ experimentId }) });
const brief = { audience: "Nonprofit teams", campaignGoal: "Review a hypothetical product", keyMessage: "GrantReady is hypothetical." };
const decide = (id: string, action: string) =>
  decideDraftRoute(req(`/api/drafts/${id}/decision`, { action, reviewer_role: "content_reviewer" }), { params: Promise.resolve({ draftId: id }) });
const approveProposal = () => decideProposalRoute(
  req("/api/proposals/prop_exp_001_1/decision", { decision: "approved", reviewer_role: "experiment_approver", outcome: "inconclusive" }),
  { params: Promise.resolve({ proposalId: "prop_exp_001_1" }) }
);

beforeEach(async () => {
  mocks.db = db();
  mocks.create.mockReset();
  vi.stubEnv("DEMO_ACCESS_CODE", "review-findings-code");
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const [id, text] of [["clm_ok", "GrantReady is hypothetical."], ["clm_two", "Reviewed second demo claim."]]) {
    await db().claim.create({ data: { id, registryVersion: "v1", text, status: "approved_demo_claim", demoOnly: true, reviewer: "Michelle", reviewedAt: new Date(), sourceOrEvidence: "Approved hypothetical demo" } });
  }
  expect((await create(req("/api/experiments", { hypothesis: "Compare hooks", primary_test_variable: "hook" }))).status).toBe(201);
  expect((await generate(req("/api/experiments/exp_001/drafts", { brief, approved_claim_ids: ["clm_ok", "clm_two"] }), exp())).status).toBe(201);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const drafts = () => db().contentDraft.findMany({ where: { experimentId: "exp_001" }, orderBy: { variantRole: "asc" } });
type Dna = Record<string, unknown> & { generation_context: Record<string, unknown> };
async function editDna(id: string, edit: (dna: Dna) => void) {
  const row = await db().contentDraft.findUniqueOrThrow({ where: { id } });
  const dna = structuredClone(row.contentDna) as Dna;
  edit(dna);
  await db().contentDraft.update({ where: { id }, data: { contentDna: dna as object } });
}
async function approveBoth() {
  const pair = await drafts();
  for (const item of pair) expect((await decide(item.id, "approve")).status).toBe(200);
  return pair;
}
async function loadAndAnalyse() {
  const pair = await drafts();
  await ingestExperimentMetrics(db(), "exp_001", [controlRow, variantRow]);
  const output = validOutput();
  output.proposal.primary_test_variable = "cta";
  output.proposal.changed_dimensions = ["cta"];
  output.proposal.content_change = { baseline_content_id: pair[0].id, variant_value: "Which grant-search step would you discuss?" };
  mocks.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } });
  return analyse(req("/api/experiments/exp_001/analysis"), exp());
}
async function expectRefused(response: Response, message: string) {
  expect(response.status, await response.clone().text()).toBe(409);
  expect((await response.json()).error).toContain(message);
}
// A refused proposal approval leaves nothing behind.
async function expectNotAdvanced() {
  expect(await db().experiment.count()).toBe(1);
  expect(await db().handoff.count()).toBe(0);
  expect((await db().analysisReport.findUniqueOrThrow({ where: { id: "prop_exp_001_1" } })).status).toBe("needs_human_approval");
}

describe("duplicate claim IDs", () => {
  it("refuses to approve a draft whose DNA repeats one claim to hide another", async () => {
    const [control] = await drafts();
    await editDna(control.id, (dna) => { dna.claim_ids_used = ["clm_ok", "clm_ok"]; });

    await expectRefused(await decide(control.id, "approve"), "claim_ids_used");
    expect((await db().contentDraft.findUniqueOrThrow({ where: { id: control.id } })).status).toBe("pending_approval");
  });

  it("refuses a Cycle 2 baseline with duplicate DNA claim IDs", async () => {
    const [control] = await approveBoth();
    await loadAndAnalyse();
    await editDna(control.id, (dna) => { dna.claim_ids_used = ["clm_ok", "clm_ok"]; });

    await expectRefused(await approveProposal(), "claim_ids_used");
    await expectNotAdvanced();
  });
});

describe("baseline role", () => {
  it("refuses a Cycle 2 baseline whose DNA role disagrees with the draft", async () => {
    const [control] = await approveBoth();
    await loadAndAnalyse();
    await editDna(control.id, (dna) => { dna.variant_role = "variant"; });

    await expectRefused(await approveProposal(), "doesn't match its variant role or claim IDs");
    await expectNotAdvanced();
  });
});

describe("DNA provenance", () => {
  const wrongContext: [string, (dna: Dna) => void][] = [
    ["experiment ID", (dna) => { dna.generation_context.experiment_id = "exp_999"; }],
    ["correlation ID", (dna) => { dna.generation_context.correlation_id = "corr_other"; }],
  ];

  it.each(wrongContext)("refuses to approve a draft whose DNA has the wrong %s", async (_label, edit) => {
    const [control] = await drafts();
    await editDna(control.id, edit);

    await expectRefused(await decide(control.id, "approve"), "different experiment or correlation chain");
  });

  it.each(wrongContext)("refuses a Cycle 2 baseline whose DNA has the wrong %s", async (_label, edit) => {
    const [control] = await approveBoth();
    await loadAndAnalyse();
    await editDna(control.id, edit);

    await expectRefused(await approveProposal(), "different experiment or correlation chain");
    await expectNotAdvanced();
  });
});

describe("claim registry metadata", () => {
  const blankEvidence = () => db().claim.update({ where: { id: "clm_ok" }, data: { sourceOrEvidence: "" } });

  it("refuses to approve a draft whose claim evidence was blanked", async () => {
    const [control] = await drafts();
    await blankEvidence();

    await expectRefused(await decide(control.id, "approve"), "Claim clm_ok has invalid registry metadata (source_or_evidence)");
  });

  it("refuses to mark a draft ready once its claim reviewer was blanked", async () => {
    const [control] = await approveBoth();
    await db().claim.update({ where: { id: "clm_ok" }, data: { reviewer: "" } });

    await expectRefused(await decide(control.id, "mark_ready"), "Claim clm_ok has invalid registry metadata (reviewer)");
  });

  it("refuses to approve a draft whose verified claim text was blanked", async () => {
    const [control] = await drafts();
    await db().claim.update({ where: { id: "clm_ok" }, data: { text: "", status: "verified_claim", demoOnly: false } });

    await expectRefused(await decide(control.id, "approve"), "Claim clm_ok has invalid registry metadata (text)");
  });

  it("refuses to advance with corrupted claim metadata, with a 409 rather than a 500", async () => {
    await approveBoth();
    await loadAndAnalyse();
    await blankEvidence();

    await expectRefused(await approveProposal(), "Claim clm_ok has invalid registry metadata");
    await expectNotAdvanced();
  });
});

describe("DNA matches the reviewed post", () => {
  const swapHook = (dna: Dna) => { dna.hook = "A hook the reviewer never saw."; };

  it("refuses to approve a draft whose DNA describes a different post", async () => {
    const [control] = await drafts();
    await editDna(control.id, swapHook);

    await expectRefused(await decide(control.id, "approve"), "doesn't match the reviewed post (hook)");
  });

  it("refuses to mark a draft ready once its DNA no longer matches the post", async () => {
    const [control] = await approveBoth();
    await editDna(control.id, swapHook);

    await expectRefused(await decide(control.id, "mark_ready"), "doesn't match the reviewed post (hook)");
  });

  it("refuses a Cycle 2 baseline whose DNA doesn't match its post", async () => {
    const [control] = await approveBoth();
    await loadAndAnalyse();
    await editDna(control.id, swapHook);

    await expectRefused(await approveProposal(), "doesn't match the reviewed post (hook)");
    await expectNotAdvanced();
  });
});
