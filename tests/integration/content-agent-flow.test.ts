import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as create } from "@/app/api/experiments/route";
import { POST as generate } from "@/app/api/experiments/[experimentId]/drafts/route";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { POST as analyse } from "@/app/api/experiments/[experimentId]/analysis/route";
import { POST as decideProposalRoute } from "@/app/api/proposals/[proposalId]/decision/route";
import { ingestExperimentMetrics } from "@/lib/controller/workflow";
import { reserveGenerationSlot } from "@/lib/persistence/quota";
import { seedClaimRegistry } from "@/lib/persistence/claims";
import claimsFile from "@/data/seed/claims.json";
import briefFile from "@/data/seed/brief.json";
import { validOutput } from "../analytics/fixtures";
import { fakeContentModel, modelResponse } from "../content-agent/fake-model";
import { controlRow, variantRow } from "../kpi/fixtures";
import { setupTestDb } from "../persistence/db";

// The Content Agent through the API, on the real GrantReady seed files. The
// database is PGlite and only the Anthropic transport is replaced.
const mocks = vi.hoisted(() => ({ db: null as unknown, create: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: () => ({ messages: { create: mocks.create } }), getAnthropicModel: () => "test-model" }));
const getDb = setupTestDb();
const db = () => getDb().db;
const auth = { authorization: "Bearer content-flow-code" };
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...auth },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const exp = (experimentId = "exp_001") => ({ params: Promise.resolve({ experimentId }) });
const request = { brief: briefFile.brief, approved_claim_ids: briefFile.default_claim_ids };
const generateDrafts = (body: unknown = request) => generate(req("/api/experiments/exp_001/drafts", body), exp());
const decideDraft = (draftId: string, action: string) =>
  decideDraftRoute(req(`/api/drafts/${draftId}/decision`, { action, reviewer_role: "content_reviewer" }), { params: Promise.resolve({ draftId }) });
const quota = async () => (await db().dailyGenerationQuota.findFirst())?.successfulCalls ?? 0;

beforeEach(async () => {
  mocks.db = db();
  mocks.create.mockReset();
  mocks.create.mockImplementation(fakeContentModel);
  vi.stubEnv("DEMO_ACCESS_CODE", "content-flow-code");
  vi.spyOn(console, "info").mockImplementation(() => {});
  await seedClaimRegistry(db(), claimsFile);
  await create(req("/api/experiments", { hypothesis: briefFile.default_hypothesis, primary_test_variable: "hook" }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Cycle 1 generation", () => {
  it("saves the model's pair, logs the run and uses a quota slot", async () => {
    const response = await generateDrafts();

    expect(response.status, await response.clone().text()).toBe(201);
    const drafts = await db().contentDraft.findMany({ orderBy: { variantRole: "asc" } });
    expect(drafts.map((draft) => [draft.variantRole, draft.status])).toEqual([["control", "pending_approval"], ["variant", "pending_approval"]]);
    expect(drafts.every((draft) => draft.body.startsWith("Hypothetical product — demonstration only"))).toBe(true);
    expect(drafts[0].body).toContain("GrantReady is designed to show upcoming grant deadlines in one place.");
    expect(await db().agentRun.findFirst()).toMatchObject({ agent: "content", status: "completed", experimentId: "exp_001" });
    expect(await quota()).toBe(1);
  });

  it("tells the agent the rejected claims and banned phrases, and no metrics", async () => {
    await generateDrafts();

    const message = mocks.create.mock.calls[0][0].messages[0].content;
    const sent = JSON.parse(message.slice(message.indexOf("\n\n") + 2));
    expect(sent.approved_claims).toHaveLength(3);
    expect(sent.rejected_claims).toContain("GrantReady raises grant success rates.");
    expect(sent.banned_phrases).toContain("guarantee");
    expect(sent.icp.label).toBe("Development directors at small US nonprofits");
  });

  it("fails visibly when the model fails: 502, no drafts, slot returned", async () => {
    mocks.create.mockReset();
    mocks.create.mockResolvedValue({ content: [], stop_reason: "refusal", usage: { input_tokens: 1, output_tokens: 0 } });

    const response = await generateDrafts();

    expect(response.status).toBe(502);
    expect(await db().contentDraft.count()).toBe(0);
    expect(await db().agentRun.findFirst()).toMatchObject({ agent: "content", status: "error" });
    expect(await quota()).toBe(0);
  });

  it("fails visibly when the model keeps breaking the claim rules", async () => {
    mocks.create.mockReset();
    mocks.create.mockResolvedValue(modelResponse({
      control: { hook: "h", pain_point: "p", value_proposition: "v", evidence: "Invented fact.", cta: "c" },
      variant_value: "other",
    }));

    expect((await generateDrafts()).status).toBe(502);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(await db().contentDraft.count()).toBe(0);
  });

  it.each([
    ["an unknown claim", { ...request, approved_claim_ids: ["clm_missing"] }, 409],
    ["a rejected claim", { ...request, approved_claim_ids: ["clm_gr_901"] }, 409],
    ["an invalid brief", { ...request, brief: { audience: "" } }, 400],
  ])("refuses %s without calling the model", async (_name, body, status) => {
    expect((await generateDrafts(body)).status).toBe(status);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await quota()).toBe(0);
  });

  it("returns 429 without calling the model once the daily cap is used", async () => {
    for (let i = 0; i < 30; i++) await reserveGenerationSlot(db(), new Date());

    expect((await generateDrafts()).status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses a second generation without another model call", async () => {
    await generateDrafts();
    mocks.create.mockClear();

    expect((await generateDrafts()).status).toBe(409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("approve and mark_ready", () => {
  async function editBody(role: "control" | "variant", edit: (body: string) => string) {
    const draft = await db().contentDraft.findFirstOrThrow({ where: { variantRole: role } });
    await db().contentDraft.update({ where: { id: draft.id }, data: { body: edit(draft.body) } });
    return draft.id;
  }

  beforeEach(async () => { await generateDrafts(); });

  it("refuses to approve a draft with a banned phrase (#12, #16, #17 F05)", async () => {
    const id = await editBody("control", (body) => `${body}\n\nGuaranteed grant award.`);

    const response = await decideDraft(id, "approve");

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('banned phrase "guarantee"');
  });

  it("refuses to mark ready a draft edited to add a banned phrase", async () => {
    const draft = await db().contentDraft.findFirstOrThrow({ where: { variantRole: "control" } });
    expect((await decideDraft(draft.id, "approve")).status).toBe(200);
    await editBody("control", (body) => `${body}\n\nA risk-free way to apply.`);

    expect((await decideDraft(draft.id, "mark_ready")).status).toBe(409);
  });

  it("refuses to approve a draft that repeats a rejected claim", async () => {
    const id = await editBody("variant", (body) => `${body}\n\nGrantReady is used by hundreds of nonprofits.`);

    const response = await decideDraft(id, "approve");

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("rejected claim");
  });
});

describe("Cycle 2", () => {
  async function analyseWith(variantValue: string) {
    await generateDrafts();
    const drafts = await db().contentDraft.findMany({ orderBy: { variantRole: "asc" } });
    for (const draft of drafts) await decideDraft(draft.id, "approve");
    await ingestExperimentMetrics(db(), "exp_001", [controlRow, variantRow]);
    const output = validOutput();
    output.proposal.primary_test_variable = "cta";
    output.proposal.changed_dimensions = ["cta"];
    output.proposal.content_change = { baseline_content_id: drafts[0].id, variant_value: variantValue };
    mocks.create.mockReset();
    mocks.create.mockResolvedValue(modelResponse(output));
    expect((await analyse(req("/api/experiments/exp_001/analysis"), exp())).status).toBe(201);
    return db().analysisReport.findFirstOrThrow();
  }
  const approve = (proposalId: string) => decideProposalRoute(
    req(`/api/proposals/${proposalId}/decision`, { decision: "approved", reviewer_role: "experiment_approver", outcome: "inconclusive" }),
    { params: Promise.resolve({ proposalId }) }
  );

  it("applies the approved change exactly, with no further model call", async () => {
    const proposal = await analyseWith("Which grant deadline worries you most?");
    mocks.create.mockClear();

    expect((await approve(proposal.id)).status).toBe(200);

    expect(mocks.create).not.toHaveBeenCalled();
    const variant = await db().contentDraft.findFirstOrThrow({ where: { experimentId: "exp_002", variantRole: "variant" } });
    expect(variant.body).toContain("Which grant deadline worries you most?");
  });

  it("marks a banned phrase in the proposed replacement as an error the approver can see", async () => {
    const proposal = await analyseWith("Guaranteed grant award awaits you.");

    expect(proposal.status).toBe("error");
    expect(proposal.errors.join(" ")).toContain('banned phrase "guarantee"');
    expect((await approve(proposal.id)).status).toBe(409);
    expect(await db().experiment.count()).toBe(1);
  });
});
