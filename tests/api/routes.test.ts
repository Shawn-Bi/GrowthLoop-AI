import type Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as logout, POST as login } from "@/app/api/access/route";
import { POST as analyse } from "@/app/api/experiments/[experimentId]/analysis/route";
import { POST as loadMetrics } from "@/app/api/experiments/[experimentId]/metrics/route";
import { GET as getExperiment } from "@/app/api/experiments/[experimentId]/route";
import { GET as getTrace } from "@/app/api/experiments/[experimentId]/trace/route";
import { GET as health } from "@/app/api/health/route";
import { POST as decide } from "@/app/api/proposals/[proposalId]/decision/route";
import { createRootExperiment } from "@/lib/persistence/experiments";
import { validOutput } from "../analytics/fixtures";
import { drafts } from "../kpi/fixtures";
import { setupTestDb, type TestDb } from "../persistence/db";
import { validDna } from "../persistence/dna";
import { SEED_CLAIM_TEXT } from "../persistence/seed";

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  create: null as unknown as ReturnType<typeof vi.fn>,
}));

vi.mock("@/lib/db", () => ({ getDb: () => mocks.db }));
vi.mock("@/lib/anthropic", () => ({
  getAnthropicClient: () => ({ messages: { create: mocks.create } }),
  getAnthropicModel: () => "test-model",
}));
vi.mock("@/lib/kpi/fixture-file", async () => {
  const { controlRow, variantRow } = await import("../kpi/fixtures");
  const { ControllerError } = await import("@/lib/controller/errors");
  return {
    readFixtureRows: async (datasetId: string) => {
      if (datasetId !== "demo_fixture_v1") {
        throw new ControllerError(`Fixture ${datasetId} not found.`, 404);
      }
      return [controlRow, variantRow];
    },
  };
});

function agentMessage(
  text: string,
  overrides: Partial<Anthropic.Message> = {}
): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test-model",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  } as Anthropic.Message;
}

const AUTH = { authorization: "Bearer test-code" };

function req(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = AUTH
) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = <T,>(value: T) => ({ params: Promise.resolve(value) });
const exp1 = params({ experimentId: "exp_001" });

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(async () => {
  vi.stubEnv("DEMO_ACCESS_CODE", "test-code");
  testDb = getTestDb();
  mocks.db = testDb.db;
  mocks.create = vi.fn().mockResolvedValue(agentMessage(JSON.stringify(validOutput())));

  await createRootExperiment(testDb.db, {
    id: "exp_001",
    correlationId: "corr_001",
    hypothesis: "A question hook earns more qualified demo requests.",
    primaryTestVariable: "hook",
  });
  // Approving the proposal generates the Cycle 2 pair from the baseline's
  // Content DNA, so the seeded drafts carry valid DNA and a registry claim.
  await testDb.db.claim.create({
    data: { id: "clm_001", registryVersion: "v1", text: SEED_CLAIM_TEXT, status: "approved_demo_claim", sourceOrEvidence: "Test-only demo claim", reviewer: "Michelle", reviewedAt: new Date("2026-10-21"), demoOnly: true },
  });
  for (const draft of drafts) {
    await testDb.db.contentDraft.create({
      data: {
        id: draft.content_id,
        experimentId: "exp_001",
        variantRole: draft.variant_role,
        body: "post",
        contentDna: validDna({ variant_role: draft.variant_role, claim_ids_used: ["clm_001"], hook: `Test ${draft.variant_role} hook`, evidence: SEED_CLAIM_TEXT }),
        claimIdsUsed: ["clm_001"],
        status: "approved",
      },
    });
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("public routes", () => {
  it("health needs no credentials and reveals nothing", async () => {
    const response = health();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("protected routes", () => {
  it.each([
    ["GET experiment", () => getExperiment(req("GET", "/api/experiments/exp_001", undefined, {}), exp1)],
    ["POST metrics", () => loadMetrics(req("POST", "/api/experiments/exp_001/metrics", { dataset_id: "demo_fixture_v1" }, {}), exp1)],
    ["POST analysis", () => analyse(req("POST", "/api/experiments/exp_001/analysis", undefined, {}), exp1)],
    ["GET trace", () => getTrace(req("GET", "/api/experiments/exp_001/trace", undefined, {}), exp1)],
    ["POST decision", () => decide(req("POST", "/api/proposals/p/decision", { decision: "approved", reviewer_role: "experiment_approver", outcome: "inconclusive" }, {}), params({ proposalId: "p" }))],
  ])("%s returns 401 without credentials", async (_name, call) => {
    const response = await call();

    expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer code", async () => {
    const response = await getExperiment(
      req("GET", "/api/experiments/exp_001", undefined, { authorization: "Bearer nope" }),
      exp1
    );

    expect(response.status).toBe(401);
  });
});

describe("access session", () => {
  it("rejects a wrong code", async () => {
    const response = await login(req("POST", "/api/access", { code: "nope" }, {}));

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("returns 503 when no access code is configured", async () => {
    vi.stubEnv("DEMO_ACCESS_CODE", "");

    const response = await login(req("POST", "/api/access", { code: "anything" }, {}));
    expect(response.status).toBe(503);
  });

  it("sets an HttpOnly, SameSite=Lax cookie that authorizes later requests", async () => {
    const response = await login(req("POST", "/api/access", { code: "test-code" }, {}));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(setCookie).toMatch(/^growthloop_access=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).not.toContain("test-code");

    const cookie = setCookie.split(";")[0];
    const authorized = await getExperiment(
      req("GET", "/api/experiments/exp_001", undefined, { cookie }),
      exp1
    );
    expect(authorized.status).toBe(200);
  });

  it("logout clears the cookie", async () => {
    const response = await logout();

    expect(response.headers.get("set-cookie")).toMatch(/growthloop_access=;/);
  });
});

describe("cycle 1 → cycle 2 through the API", () => {
  it("loads metrics, analyses, approves and hands off to exp_002", async () => {
    const metrics = await loadMetrics(
      req("POST", "/api/experiments/exp_001/metrics", { dataset_id: "demo_fixture_v1" }),
      exp1
    );
    expect(metrics.status).toBe(201);
    expect(await metrics.json()).toMatchObject({ saved: 14, quarantined: [], ignored_rows: 0 });

    const analysis = await analyse(req("POST", "/api/experiments/exp_001/analysis"), exp1);
    const proposal = await analysis.json();
    expect(analysis.status).toBe(201);
    expect(proposal).toMatchObject({
      proposal_id: "prop_exp_001_1",
      status: "needs_human_approval",
      review_flags: [],
    });
    expect(mocks.create).toHaveBeenCalledTimes(1);

    const decisionBody = { decision: "approved", reviewer_role: "experiment_approver", outcome: "inconclusive" };
    const proposalParams = params({ proposalId: "prop_exp_001_1" });
    const decision = await decide(
      req("POST", "/api/proposals/prop_exp_001_1/decision", decisionBody),
      proposalParams
    );
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({
      proposal: { status: "approved" },
      handoff: { experiment_id: "exp_002", parent_experiment_id: "exp_001" },
    });

    const next = await getExperiment(
      req("GET", "/api/experiments/exp_002"),
      params({ experimentId: "exp_002" })
    );
    expect(await next.json()).toMatchObject({
      experiment: { id: "exp_002", cycle: 2, parent_experiment_id: "exp_001" },
      handoff: { primary_test_variable: "hook", next_action: "generate_content_drafts" },
    });

    const trace = await getTrace(req("GET", "/api/experiments/exp_001/trace"), exp1);
    const { trace: entries } = await trace.json();
    expect(entries.map((entry: { experiment_id: string }) => entry.experiment_id)).toEqual([
      "exp_001",
      "exp_002",
    ]);

    const repeat = await decide(
      req("POST", "/api/proposals/prop_exp_001_1/decision", decisionBody),
      proposalParams
    );
    expect(repeat.status).toBe(409);
  });

  it("returns 403 when the content reviewer role tries to decide", async () => {
    await loadMetrics(req("POST", "/api/experiments/exp_001/metrics", { dataset_id: "demo_fixture_v1" }), exp1);
    await analyse(req("POST", "/api/experiments/exp_001/analysis"), exp1);

    const response = await decide(
      req("POST", "/api/proposals/prop_exp_001_1/decision", {
        decision: "approved",
        reviewer_role: "content_reviewer",
      }),
      params({ proposalId: "prop_exp_001_1" })
    );

    expect(response.status).toBe(403);
  });

  it("returns 502 with the agent's error when the model refuses", async () => {
    mocks.create = vi.fn().mockResolvedValue(
      agentMessage("", {
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: null },
      } as Partial<Anthropic.Message>)
    );
    await loadMetrics(req("POST", "/api/experiments/exp_001/metrics", { dataset_id: "demo_fixture_v1" }), exp1);

    const response = await analyse(req("POST", "/api/experiments/exp_001/analysis"), exp1);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "The model declined the request (category: cyber).",
    });
  });
});

describe("request validation and errors", () => {
  it("rejects an invalid decision body with 400", async () => {
    const response = await decide(
      req("POST", "/api/proposals/p/decision", { decision: "maybe" }),
      params({ proposalId: "p" })
    );

    expect(response.status).toBe(400);
  });

  it("returns 404 for an unknown fixture", async () => {
    const response = await loadMetrics(
      req("POST", "/api/experiments/exp_001/metrics", { dataset_id: "missing" }),
      exp1
    );

    expect(response.status).toBe(404);
  });

  it("hides unexpected errors behind a generic 500", async () => {
    mocks.db = null;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await getExperiment(req("GET", "/api/experiments/exp_001"), exp1);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal error." });
    expect(log).toHaveBeenCalledWith(
      "Unhandled TypeError in GET /api/experiments/exp_001"
    );
  });
});
