import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as create } from "@/app/api/experiments/route";
import { POST as generate } from "@/app/api/experiments/[experimentId]/drafts/route";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { seedClaimRegistry } from "@/lib/persistence/claims";
import { setupTestDb } from "../persistence/db";

// PR #11: a claim dropped from claims.json is kept as rejected_claim, so it
// can't generate or advance drafts, but drafts that used it still resolve.
const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
const getDb = setupTestDb();
const auth = { authorization: "Bearer claim-retention-code" };
const req = (path: string, body?: unknown) => new NextRequest(`http://localhost${path}`, {
  method: "POST", headers: { "content-type": "application/json", ...auth },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const exp = (experimentId = "exp_001") => ({ params: Promise.resolve({ experimentId }) });
const draft = (draftId: string) => ({ params: Promise.resolve({ draftId }) });
const brief = { audience: "Nonprofit teams", campaignGoal: "Review a hypothetical product", keyMessage: "GrantReady is hypothetical." };

// Test-only registry in the GL-02 shape; not Michelle's GrantReady claims.
const claim = (claim_id: string, text: string, status: string) => ({
  claim_id, text, status, source_or_evidence: "Test evidence", reviewer: "Michelle",
  reviewed_at: "2026-10-28", demo_only: true,
});
const registry = (version: string, claims: ReturnType<typeof claim>[]) => ({ registry_version: version, claims });
const kept = claim("clm_kept", "GrantReady is hypothetical.", "approved_demo_claim");
const dropped = claim("clm_dropped", "GrantReady drafts in minutes.", "approved_demo_claim");
const rejected = claim("clm_rejected", "Guaranteed grant award.", "rejected_claim");

beforeEach(async () => {
  mocks.db = getDb().db;
  vi.stubEnv("DEMO_ACCESS_CODE", "claim-retention-code");
  vi.spyOn(console, "info").mockImplementation(() => {});
  await seedClaimRegistry(getDb().db, registry("v1", [kept, dropped, rejected]));
  expect((await create(req("/api/experiments", { hypothesis: "Compare hooks", primary_test_variable: "hook" }))).status).toBe(201);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

const decide = (id: string, action: string) =>
  decideDraftRoute(req(`/api/drafts/${id}/decision`, { action, reviewer_role: "content_reviewer" }), draft(id));

it("blocks approving or marking ready a draft whose claim was dropped from the file", async () => {
  const response = await generate(req("/api/experiments/exp_001/drafts", { brief, approved_claim_ids: ["clm_kept", "clm_dropped"] }), exp());
  expect(response.status).toBe(201);
  const [control, variant] = await getDb().db.contentDraft.findMany({ orderBy: { variantRole: "asc" } });
  expect((await decide(control.id, "approve")).status).toBe(200);

  const result = await seedClaimRegistry(getDb().db, registry("v2", [kept, rejected]));
  expect(result.retired).toEqual(["clm_dropped"]);

  for (const [id, action] of [[control.id, "mark_ready"], [variant.id, "approve"]]) {
    const blocked = await decide(id, action);
    expect(blocked.status).toBe(409);
    expect((await blocked.json()).error).toContain("clm_dropped");
  }
  // The drafts still resolve to the retired claim's text and evidence.
  const history = await getDb().db.claim.findMany({ where: { id: { in: variant.claimIdsUsed } }, orderBy: { id: "asc" } });
  expect(history.map((row) => [row.id, row.status, row.text])).toEqual([
    ["clm_dropped", "rejected_claim", "GrantReady drafts in minutes."],
    ["clm_kept", "approved_demo_claim", "GrantReady is hypothetical."],
  ]);
});

it.each([
  ["dropped from the file", "clm_dropped"],
  ["rejected in the file", "clm_rejected"],
  ["unknown", "clm_unknown"],
])("refuses to generate drafts with a claim %s", async (_label, id) => {
  await seedClaimRegistry(getDb().db, registry("v2", [kept, rejected]));

  const response = await generate(req("/api/experiments/exp_001/drafts", { brief, approved_claim_ids: ["clm_kept", id] }), exp());

  expect(response.status).toBe(409);
  expect(await getDb().db.contentDraft.count()).toBe(0);
});
