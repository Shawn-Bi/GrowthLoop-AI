import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as decideDraftRoute } from "@/app/api/drafts/[draftId]/decision/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/experiments/route";
import { setupTestDb, type TestDb } from "../persistence/db";
import { validDna } from "../persistence/dna";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));

const AUTH = { authorization: "Bearer test-code" };

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = AUTH) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const draft = (draftId: string) => ({ params: Promise.resolve({ draftId }) });

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(() => {
  vi.stubEnv("DEMO_ACCESS_CODE", "test-code");
  testDb = getTestDb();
  mocks.db = testDb.db;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/experiments", () => {
  const body = { hypothesis: "A pain-point hook earns more demos.", primary_test_variable: "hook" };

  it("creates exp_001 and lists it", async () => {
    const created = await createRoute(req("POST", "/api/experiments", body));

    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ experiment_id: "exp_001", correlation_id: "corr_exp_001" });

    const list = await listRoute(req("GET", "/api/experiments"));
    expect((await list.json()).experiments).toEqual([
      expect.objectContaining({ id: "exp_001", cycle: 1, status: "open" }),
    ]);
  });

  it("refuses a second Cycle 1 with 409", async () => {
    await createRoute(req("POST", "/api/experiments", body));

    const again = await createRoute(req("POST", "/api/experiments", body));
    expect(again.status).toBe(409);
  });

  it("rejects an unknown test variable with 400", async () => {
    const response = await createRoute(
      req("POST", "/api/experiments", { ...body, primary_test_variable: "icp" })
    );

    expect(response.status).toBe(400);
  });

  it("requires access", async () => {
    const response = await createRoute(req("POST", "/api/experiments", body, {}));

    expect(response.status).toBe(401);
  });
});

describe("POST /api/drafts/[draftId]/decision", () => {
  beforeEach(async () => {
    await createRoute(req("POST", "/api/experiments", { hypothesis: "h", primary_test_variable: "hook" }));
    await testDb.db.claim.create({ data: { id: "clm_ok", registryVersion: "v1", text: "a", status: "verified_claim", sourceOrEvidence: "test", reviewer: "test", reviewedAt: new Date(), demoOnly: false } });
    await testDb.db.contentDraft.create({
      data: { id: "cnt_001", experimentId: "exp_001", variantRole: "control", body: "a", contentDna: validDna(), claimIdsUsed: ["clm_ok"], status: "pending_approval" },
    });
  });

  it("approves, then marks the draft ready for manual publication", async () => {
    const approved = await decideDraftRoute(
      req("POST", "/api/drafts/cnt_001/decision", { action: "approve", reviewer_role: "content_reviewer" }),
      draft("cnt_001")
    );
    expect(approved.status).toBe(200);
    expect((await approved.json()).draft.status).toBe("approved");

    const ready = await decideDraftRoute(
      req("POST", "/api/drafts/cnt_001/decision", { action: "mark_ready", reviewer_role: "content_reviewer" }),
      draft("cnt_001")
    );
    expect((await ready.json()).draft.status).toBe("ready_for_manual_publication");
  });

  it("returns 403 for the experiment approver role", async () => {
    const response = await decideDraftRoute(
      req("POST", "/api/drafts/cnt_001/decision", { action: "approve", reviewer_role: "experiment_approver" }),
      draft("cnt_001")
    );

    expect(response.status).toBe(403);
  });

  it("returns 409 for an illegal transition", async () => {
    const response = await decideDraftRoute(
      req("POST", "/api/drafts/cnt_001/decision", { action: "mark_ready", reviewer_role: "content_reviewer" }),
      draft("cnt_001")
    );

    expect(response.status).toBe(409);
  });

  it("returns 400 for an unknown action", async () => {
    const response = await decideDraftRoute(
      req("POST", "/api/drafts/cnt_001/decision", { action: "publish", reviewer_role: "content_reviewer" }),
      draft("cnt_001")
    );

    expect(response.status).toBe(400);
  });
});
