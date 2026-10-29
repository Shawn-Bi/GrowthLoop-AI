import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as create } from "@/app/api/experiments/route";
import { POST as generate } from "@/app/api/experiments/[experimentId]/drafts/route";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { POST as loadMetrics } from "@/app/api/experiments/[experimentId]/metrics/route";
import { POST as analyse } from "@/app/api/experiments/[experimentId]/analysis/route";
import { POST as decideProposalRoute } from "@/app/api/proposals/[proposalId]/decision/route";
import { ingestExperimentMetrics } from "@/lib/controller/workflow";
import { contentDnaSchema } from "@/schemas/content";
import { mapExperimentVariable, receiveContentHandoff } from "@/lib/content-agent/handoff";
import { testVariableSchema } from "@/schemas/analytics";
import { setupTestDb } from "../persistence/db";
import { controlRow, variantRow } from "../kpi/fixtures";
import { validOutput } from "../analytics/fixtures";
import { mkdirSync, writeFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({ db: null as unknown, create: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/anthropic", () => ({ getAnthropicClient: () => ({ messages: { create: mocks.create } }), getAnthropicModel: () => "test-model" }));
const getDb = setupTestDb();
const auth = { authorization: "Bearer integration-test-code" };
const req = (path: string, body?: unknown, authenticated = true) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...(authenticated ? auth : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const exp = (experimentId = "exp_001") => ({ params: Promise.resolve({ experimentId }) });
const draft = (draftId: string) => ({ params: Promise.resolve({ draftId }) });
const proposal = () => ({ params: Promise.resolve({ proposalId: "prop_exp_001_1" }) });
const input = { brief: { audience: "Nonprofit teams", campaignGoal: "Review a hypothetical product", keyMessage: "GrantReady is hypothetical." }, approved_claim_ids: ["clm_ok"] };
const traces: unknown[] = [];
beforeEach(async () => {
  mocks.db = getDb().db;
  mocks.create.mockReset();
  traces.length = 0;
  vi.stubEnv("DEMO_ACCESS_CODE", "integration-test-code");
  vi.spyOn(console, "info").mockImplementation((line: string) => { traces.push(JSON.parse(line)); });
  await getDb().db.claim.create({ data: { id: "clm_ok", registryVersion: "v1", text: "GrantReady is hypothetical.", status: "approved_demo_claim", demoOnly: true, reviewer: "Michelle", reviewedAt: new Date(), sourceOrEvidence: "Approved hypothetical demo" } });
  expect((await create(req("/api/experiments", { hypothesis: "Compare hooks", primary_test_variable: "hook" }))).status).toBe(201);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function generateFirst() {
  const response = await generate(req("/api/experiments/exp_001/drafts", input), exp());
  expect(response.status).toBe(201);
  return getDb().db.contentDraft.findMany({ where: { experimentId: "exp_001" }, orderBy: { variantRole: "asc" } });
}
async function approveFirst() {
  const drafts = await generateFirst();
  for (const item of drafts) {
    const response = await decideDraftRoute(req(`/api/drafts/${item.id}/decision`, { action: "approve", reviewer_role: "content_reviewer" }), draft(item.id));
    expect(response.status).toBe(200);
  }
  return drafts;
}
async function analyseFirst() {
  const drafts = await approveFirst();
  await ingestExperimentMetrics(getDb().db, "exp_001", [controlRow, variantRow]);
  const output = validOutput();
  output.proposal.primary_test_variable = "cta";
  output.proposal.changed_dimensions = ["cta"];
  output.proposal.content_change = { baseline_content_id: drafts[0].id, variant_value: "Which grant-search step would you discuss?" };
  mocks.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } });
  expect((await analyse(req("/api/experiments/exp_001/analysis"), exp())).status).toBe(201);
  return drafts;
}
it("runs the two-cycle API workflow with real Content code, Analytics parsing, SQL persistence and a shared handoff trace", async () => {
  const first = await analyseFirst();
  const call = mocks.create.mock.calls[0][0];
  const sent = JSON.parse(call.messages[0].content.split("\n\n")[1]);
  expect(sent.metrics).toHaveLength(14);
  expect(sent.drafts.map((d: { content_id: string }) => d.content_id).sort()).toEqual(first.map((d) => d.id).sort());
  expect(sent.drafts[0].content_dna.primary_test_variable).toBe("hook");
  expect(await getDb().db.experiment.count()).toBe(1);
  const decision = await decideProposalRoute(req("/api/proposals/prop_exp_001_1/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal());
  expect(decision.status, await decision.clone().text()).toBe(200);
  const result = await decision.json();
  const second = await getDb().db.contentDraft.findMany({ where: { experimentId: "exp_002" }, orderBy: { variantRole: "asc" } });
  expect(second).toHaveLength(2);
  const dna = second.map((d) => contentDnaSchema.parse(d.contentDna));
  for (const dimension of testVariableSchema.options) expect(dna[0][dimension] !== dna[1][dimension]).toBe(dimension === "cta");
  expect(dna[1].cta).toBe("Which grant-search step would you discuss?");
  expect(dna[0].generation_context.findings).toEqual(result.handoff.findings);
  expect(dna[0].generation_context.metric_ids).toEqual(result.handoff.metric_ids);
  expect(dna[0].generation_context.correlation_id).toBe("corr_exp_001");
  expect(second.every((d) => d.status === "pending_approval")).toBe(true);
  const send = traces.find((t) => (t as { side: string; experiment_id: string }).side === "controller_send" && (t as { experiment_id: string }).experiment_id === "exp_002");
  const receive = traces.find((t) => (t as { side: string; experiment_id: string }).side === "content_receive" && (t as { experiment_id: string }).experiment_id === "exp_002");
  expect(receive).toMatchObject({ ...(send as object), side: "content_receive" });
  expect(JSON.stringify(traces)).not.toContain("GrantReady");
  expect(JSON.stringify(traces)).not.toContain("integration-test-code");
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/content-handoff-trace.json", JSON.stringify({ mode: "API handlers + real SQL + stubbed Anthropic transport", traces }, null, 2));
  const again = await decideProposalRoute(req("/api/proposals/prop_exp_001_1/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal());
  expect(again.status).toBe(409);
  expect(await getDb().db.contentDraft.count()).toBe(4);
  expect((await decideDraftRoute(req(`/api/drafts/${second[0].id}/decision`, { action: "mark_ready", reviewer_role: "content_reviewer" }), draft(second[0].id))).status).toBe(409);
});
it("requires access and persists neither half of a rejected generation", async () => {
  expect((await generate(req("/api/experiments/exp_001/drafts", input, false), exp())).status).toBe(401);
  await getDb().db.claim.update({ where: { id: "clm_ok" }, data: { status: "rejected_claim" } });
  expect((await generate(req("/api/experiments/exp_001/drafts", input), exp())).status).toBe(409);
  expect(await getDb().db.contentDraft.count()).toBe(0);
});
it("revalidates claims at approval and manual-ready time", async () => {
  const first = await generateFirst();
  expect((await decideDraftRoute(req("/decision", { action: "approve", reviewer_role: "content_reviewer" }), draft(first[0].id))).status).toBe(200);
  await getDb().db.claim.update({ where: { id: "clm_ok" }, data: { status: "rejected_claim" } });
  for (const [id, action] of [[first[0].id, "mark_ready"], [first[1].id, "approve"]]) {
    expect((await decideDraftRoute(req("/decision", { action, reviewer_role: "content_reviewer" }), draft(id))).status).toBe(409);
  }
});
it("does not advance pending/rejected proposals or the wrong reviewer role", async () => {
  await analyseFirst();
  expect(await getDb().db.experiment.count()).toBe(1);
  expect((await generate(req("/drafts"), exp("exp_002"))).status).toBe(404);
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "content_reviewer" }), proposal())).status).toBe(403);
  expect((await decideProposalRoute(req("/decision", { decision: "rejected", reviewer_role: "experiment_approver" }), proposal())).status).toBe(200);
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal())).status).toBe(409);
  expect(await getDb().db.experiment.count()).toBe(1);
});
it("rolls the entire approval back when the approved change cannot generate a valid pair", async () => {
  await analyseFirst();
  const row = await getDb().db.analysisReport.findUniqueOrThrow({ where: { id: "prop_exp_001_1" } });
  const analysis = validOutput();
  analysis.proposal.content_change = { baseline_content_id: "missing", variant_value: "New hook" };
  await getDb().db.analysisReport.update({ where: { id: row.id }, data: { analysis } });
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal())).status).toBe(409);
  expect(await getDb().db.experiment.count()).toBe(1);
  expect(await getDb().db.handoff.count()).toBe(0);
  expect(await getDb().db.auditEvent.count({ where: { recordType: "experiment_proposal" } })).toBe(0);
  expect((await getDb().db.analysisReport.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("needs_human_approval");
});
it("rejects unsupported dimensions and records missing fields rather than substituting", () => {
  expect(() => mapExperimentVariable("messaging_angle")).toThrow("Unsupported");
  const events: unknown[] = [];
  expect(() => receiveContentHandoff({ correlation_id: "corr_bad", primary_test_variable: "messaging_angle" }, input.brief, [], undefined, (e) => events.push(e))).toThrow("Invalid Content handoff");
  expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ side: "content_reject", missing_or_rejected: expect.arrayContaining(["findings", "metric_ids", "approved_claim_ids", "approval_state", "primary_test_variable"]) })]));
});
it.each(["pending", "revoked", "rejected"])("Content boundary rejects %s claims", (status) => {
  // The resolver used by receiveContentHandoff rejects all statuses except approved.
  const h = { schema_version: "1.1", task_id: "t", correlation_id: "c", idempotency_key: "k", experiment_id: "e", parent_experiment_id: null,
    source_content_ids: [], approved_claim_ids: ["clm_ok"], hypothesis: "h", primary_test_variable: "hook", control_conditions: ["fixed"],
    metric_ids: [], findings: [], uncertainty: "simulated", approval_state: "approved", next_action: "generate_content_drafts" };
  expect(() => receiveContentHandoff(h, input.brief, [{ id: "clm_ok", text: "GrantReady is hypothetical.", status: status as "pending" | "revoked" | "rejected" }], undefined, () => {})).toThrow("not approved");
});

it.each(testVariableSchema.options)("persists an exactly-one-variable %s experiment", async (variable) => {
  await getDb().db.experiment.update({ where: { id: "exp_001" }, data: { primaryTestVariable: variable } });
  const drafts = await generateFirst();
  const dna = drafts.map((item) => contentDnaSchema.parse(item.contentDna));
  for (const dimension of testVariableSchema.options) expect(dna[0][dimension] !== dna[1][dimension]).toBe(dimension === variable);
  expect(dna[0].claim_ids_used).toEqual(dna[1].claim_ids_used);
});
it("rejects duplicate generation without additional drafts", async () => {
  await generateFirst();
  expect((await generate(req("/drafts", input), exp())).status).toBe(409);
  expect(await getDb().db.contentDraft.count()).toBe(2);
});
it("rejects incomplete evidence and unknown dimensions without storing drafts", async () => {
  await getDb().db.experiment.update({ where: { id: "exp_001" }, data: { primaryTestVariable: "messaging_angle" } });
  expect((await generate(req("/drafts", input), exp())).status).toBe(400);
  expect(await getDb().db.contentDraft.count()).toBe(0);
});
it("prevents multi-variable proposals and rolls back approval", async () => {
  await analyseFirst();
  const row = await getDb().db.analysisReport.findUniqueOrThrow({ where: { id: "prop_exp_001_1" } });
  const analysis = validOutput();
  analysis.proposal.changed_dimensions = ["hook", "cta"];
  await getDb().db.analysisReport.update({ where: { id: row.id }, data: { analysis } });
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal())).status).toBe(409);
  expect(await getDb().db.experiment.count()).toBe(1);
});
it("rejects an approved next-cycle change after its claim was revoked", async () => {
  await analyseFirst();
  await getDb().db.claim.update({ where: { id: "clm_ok" }, data: { status: "rejected_claim" } });
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal())).status).toBe(409);
  expect(await getDb().db.experiment.count()).toBe(1);
  expect(await getDb().db.handoff.count()).toBe(0);
});
it.each(["needs_human_approval", "rejected"])("rejects a %s handoff at the Content boundary", (approval_state) => {
  const h = { schema_version: "1.1", task_id: "t", correlation_id: "c", idempotency_key: "k", experiment_id: "e", parent_experiment_id: null,
    source_content_ids: [], approved_claim_ids: ["clm_ok"], hypothesis: "h", primary_test_variable: "hook", control_conditions: ["fixed"],
    metric_ids: [], findings: [], uncertainty: "simulated", approval_state, next_action: "generate_content_drafts" };
  expect(() => receiveContentHandoff(h, input.brief, [{ id: "clm_ok", text: "GrantReady is hypothetical.", status: "approved" }], undefined, () => {})).toThrow("approved handoff");
});

it("completes both cycles over HTTP using the production API handlers", async () => {
  const { createServer } = await import("node:http");
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const request = new NextRequest(`http://localhost${incoming.url}`, {
        method: incoming.method,
        headers: { "content-type": "application/json", authorization: incoming.headers.authorization ?? "" },
        body: Buffer.concat(chunks).length ? Buffer.concat(chunks).toString() : undefined,
      });
      const path = incoming.url!;
      let response: Response;
      if (path === "/api/experiments") response = await create(request);
      else if (/\/drafts$/.test(path)) response = await generate(request, exp(path.split("/")[3]));
      else if (/\/metrics$/.test(path)) response = await loadMetrics(request, exp(path.split("/")[3]));
      else if (/\/analysis$/.test(path)) response = await analyse(request, exp(path.split("/")[3]));
      else if (path.startsWith("/api/drafts/")) response = await decideDraftRoute(request, draft(path.split("/")[3]));
      else response = await decideProposalRoute(request, proposal());
      outgoing.writeHead(response.status, { "content-type": "application/json" });
      outgoing.end(await response.text());
    } catch { outgoing.writeHead(500); outgoing.end("HTTP harness failure"); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const post = async (path: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBeLessThan(300);
    return data;
  };
  try {
    await getDb().db.experiment.delete({ where: { id: "exp_001" } });
    await post("/api/experiments", { hypothesis: "Compare hooks", primary_test_variable: "hook" });
    const generated = await post("/api/experiments/exp_001/drafts", input);
    for (const item of generated.drafts) await post(`/api/drafts/${item.content_id}/decision`, { action: "approve", reviewer_role: "content_reviewer" });
    const metricsResult = await post("/api/experiments/exp_001/metrics", { dataset_id: "test_fixture" });
    expect(metricsResult.saved).toBe(14);
    const output = validOutput();
    output.proposal.content_change = { baseline_content_id: generated.drafts[0].content_id, variant_value: "A different community conversation starts here." };
    mocks.create.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 50 } });
    await post("/api/experiments/exp_001/analysis");
    await post("/api/proposals/prop_exp_001_1/decision", { decision: "approved", reviewer_role: "experiment_approver" });
    const children = await getDb().db.contentDraft.findMany({ where: { experimentId: "exp_002" } });
    expect(children).toHaveLength(2);
    expect(children.every((child) => child.status === "pending_approval")).toBe(true);
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/content-handoff-http-trace.json", JSON.stringify({ mode: "HTTP harness + production API handlers + real SQL + stubbed Anthropic transport", traces }, null, 2));
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

it("retains generated DNA and handoff evidence after closing and reopening PostgreSQL", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createTestDb } = await import("../persistence/db");
  const { generateExperimentContent } = await import("@/lib/controller/content-generation");
  const { createCycleOneExperiment } = await import("@/lib/controller/workflow");
  const dir = await mkdtemp(join(tmpdir(), "growthloop-restart-"));
  let stored = await createTestDb(dir);
  try {
    await stored.db.claim.create({ data: { id: "clm_ok", registryVersion: "v1", text: "GrantReady is hypothetical.", status: "approved_demo_claim", demoOnly: true, reviewer: "Michelle", reviewedAt: new Date(), sourceOrEvidence: "Demo" } });
    await createCycleOneExperiment(stored.db, { hypothesis: "Compare hooks", primaryTestVariable: "hook" });
    await generateExperimentContent(stored.db, "exp_001", input, () => {});
    const before = await stored.db.contentDraft.findMany({ orderBy: { id: "asc" } });
    await stored.close();
    stored = await createTestDb(dir);
    const after = await stored.db.contentDraft.findMany({ orderBy: { id: "asc" } });
    expect(after).toEqual(before);
    expect(contentDnaSchema.parse(after[0].contentDna).generation_context.correlation_id).toBe("corr_exp_001");
    await expect(generateExperimentContent(stored.db, "exp_001", input, () => {})).rejects.toThrow("already exist");
  } finally { await stored.close(); await rm(dir, { recursive: true, force: true }); }
});
it("serializes concurrent generation into one persisted pair", async () => {
  const responses = await Promise.all([generate(req("/drafts", input), exp()), generate(req("/drafts", input), exp())]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await getDb().db.contentDraft.count()).toBe(2);
});
it.each(["findings", "metric_ids", "primary_test_variable", "approval_state"])("rejects missing persisted %s without generating a child pair", async (field) => {
  await analyseFirst();
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal())).status).toBe(200);
  await getDb().db.contentDraft.deleteMany({ where: { experimentId: "exp_002" } });
  const stored = await getDb().db.handoff.findUniqueOrThrow({ where: { experimentId: "exp_002" } });
  const payload = JSON.parse(JSON.stringify(stored.payload));
  delete payload[field];
  await getDb().db.handoff.update({ where: { experimentId: "exp_002" }, data: { payload } });
  expect((await generate(req("/drafts"), exp("exp_002"))).status).toBe(400);
  expect(await getDb().db.contentDraft.count({ where: { experimentId: "exp_002" } })).toBe(0);
});
it("rejects substituted metric IDs even when they belong to the parent", async () => {
  await analyseFirst();
  expect((await decideProposalRoute(req("/decision", { decision: "approved", reviewer_role: "experiment_approver" }), proposal())).status).toBe(200);
  await getDb().db.contentDraft.deleteMany({ where: { experimentId: "exp_002" } });
  const stored = await getDb().db.handoff.findUniqueOrThrow({ where: { experimentId: "exp_002" } });
  const payload = JSON.parse(JSON.stringify(stored.payload));
  const other = await getDb().db.metricRecord.findFirstOrThrow({ where: { experimentId: "exp_001", metric: "impressions" } });
  payload.metric_ids.push(other.id);
  await getDb().db.handoff.update({ where: { experimentId: "exp_002" }, data: { payload } });
  expect((await generate(req("/drafts"), exp("exp_002"))).status).toBe(409);
  expect(await getDb().db.contentDraft.count({ where: { experimentId: "exp_002" } })).toBe(0);
});
