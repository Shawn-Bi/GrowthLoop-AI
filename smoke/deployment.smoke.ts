import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

// S4 and S2 (preview) against a running deployment: health and access
// protection, then a real analytics round trip written through the deployed
// app, a redeploy, and a read-back. Seeds and removes its own exp_smoke_*
// rows. Costs one Analytics Agent call and one daily generation slot.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const baseUrl = process.env.PREVIEW_URL?.replace(/\/$/, "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const accessCode = process.env.DEMO_ACCESS_CODE;
const databaseUrl = process.env.DATABASE_URL;
const configured = Boolean(baseUrl && accessCode && databaseUrl);

const ROOT = "exp_smoke_001";
const NEXT = "exp_smoke_002";
// Within maxDuration (120 s) of the analysis route.
const ANALYSIS_BUDGET_MS = 120_000;

async function call<T = unknown>(
  method: string,
  path: string,
  { body, withCode = true }: { body?: unknown; withCode?: boolean } = {}
): Promise<{ status: number; json: T; ms: number }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;
  if (withCode) headers.authorization = `Bearer ${accessCode}`;

  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  const ms = Date.now() - started;
  console.log(`${method} ${path} → ${response.status} in ${ms} ms`);

  let json: unknown = text.slice(0, 300);
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON, e.g. a platform protection page.
  }
  return { status: response.status, json: json as T, ms };
}

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ adapter: new PrismaPg(databaseUrl!) });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

async function removeSmokeRows(db: PrismaClient) {
  const smoke = { startsWith: "exp_smoke_" };
  await db.handoff.deleteMany({ where: { experimentId: smoke } });
  await db.auditEvent.deleteMany({ where: { recordId: { startsWith: "prop_exp_smoke_" } } });
  await db.agentRun.deleteMany({ where: { experimentId: smoke } });
  await db.analysisReport.deleteMany({ where: { experimentId: smoke } });
  await db.metricRecord.deleteMany({ where: { experimentId: smoke } });
  await db.contentDraft.deleteMany({ where: { experimentId: smoke } });
  await db.experiment.deleteMany({ where: { id: smoke } });
}

describe("Deployment smoke", () => {
  it("config", () => {
    console.log(`Target: ${baseUrl ?? "(PREVIEW_URL not set)"}`);
    console.log(
      `Access code present: ${Boolean(accessCode)}; protection bypass present: ${Boolean(bypassSecret)}`
    );
    expect(baseUrl, "Set PREVIEW_URL in .env.local").toBeTruthy();
    expect(accessCode, "Set DEMO_ACCESS_CODE in .env.local").toBeTruthy();
    expect(databaseUrl, "Set DATABASE_URL in .env.local").toBeTruthy();
  });

  it.skipIf(!configured)("S4 health and access protection", async () => {
    const health = await call("GET", "/api/health", { withCode: false });
    expect(health.status).toBe(200);
    expect(health.json).toEqual({ status: "ok" });

    // A JSON 401 from the app (not a platform login page) proves the app's
    // own protection runs on the deployment.
    const denied = await call("GET", `/api/experiments/${ROOT}`, { withCode: false });
    expect(denied.status).toBe(401);
    expect(denied.json).toEqual({ error: "Unauthorized." });

    const page = await call("GET", "/experiments", { withCode: false });
    expect(page.status).toBe(307);
  });

  it.skipIf(!configured)("S2 write", async () => {
    await withDb(async (db) => {
      await removeSmokeRows(db);
      await db.experiment.create({
        data: {
          id: ROOT,
          correlationId: "corr_smoke",
          cycle: 1,
          hypothesis: "Deployment smoke test.",
          primaryTestVariable: "hook",
        },
      });
      for (const role of ["control", "variant"] as const) {
        await db.contentDraft.create({
          data: {
            id: `cnt_smoke_${role}`,
            experimentId: ROOT,
            variantRole: role,
            body: `Smoke-test ${role} draft. Hypothetical product — demonstration only.`,
            contentDna: { hook: role === "control" ? "question" : "pain point" },
            claimIdsUsed: [],
            status: "approved",
          },
        });
      }
    });

    const metrics = await call<{ saved: number }>("POST", `/api/experiments/${ROOT}/metrics`, {
      body: { dataset_id: "smoke_fixture_v1" },
    });
    expect(metrics.status, JSON.stringify(metrics.json)).toBe(201);
    expect(metrics.json.saved).toBe(14);

    const analysis = await call<{
      proposal_id: string;
      status: string;
      review_flags: string[];
    }>("POST", `/api/experiments/${ROOT}/analysis`);
    expect(analysis.status, JSON.stringify(analysis.json)).toBe(201);
    expect(analysis.ms).toBeLessThan(ANALYSIS_BUDGET_MS);
    console.log(
      `Proposal ${analysis.json.proposal_id}: ${analysis.json.status}, ${analysis.json.review_flags.length} review flags`
    );

    const decision = await call<{ handoff: { experiment_id: string } }>(
      "POST",
      `/api/proposals/${analysis.json.proposal_id}/decision`,
      { body: { decision: "approved", reviewer_role: "experiment_approver", outcome: "inconclusive" } }
    );
    expect(decision.status, JSON.stringify(decision.json)).toBe(200);
    expect(decision.json.handoff.experiment_id).toBe(NEXT);
    console.log(`Wrote ${NEXT} through the deployment. Redeploy, then run npm run smoke:deploy:read.`);
  });

  it.skipIf(!configured)("S2 read", async () => {
    const next = await call<{
      experiment: { parent_experiment_id: string };
      handoff: { next_action: string };
    }>("GET", `/api/experiments/${NEXT}`);
    expect(next.status, `Run npm run smoke:deploy:write first`).toBe(200);
    expect(next.json.experiment.parent_experiment_id).toBe(ROOT);
    expect(next.json.handoff.next_action).toBe("generate_content_drafts");

    const trace = await call<{ trace: { experiment_id: string }[] }>(
      "GET",
      `/api/experiments/${ROOT}/trace`
    );
    expect(trace.json.trace.map((entry) => entry.experiment_id)).toEqual([ROOT, NEXT]);
    console.log(`Read ${NEXT} and its handoff back from the redeployed app.`);
  });

  it.skipIf(!databaseUrl)("S2 cleanup", async () => {
    await withDb(removeSmokeRows);
    console.log("Removed the exp_smoke_* rows.");
  });
});
