import { describe, expect, it } from "vitest";
import briefFile from "@/data/seed/brief.json";
import { testVariableSchema } from "@/schemas/analytics";

// GL-10/GL-11: the whole two-cycle workflow through the deployed API, with real
// Claude on both agents, real Neon and the seeded GrantReady claims. Costs two
// model calls and leaves exp_001 and exp_002 in the database, so the UI can show
// them; `npm run demo:reset -- --yes` removes them.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const baseUrl = process.env.PREVIEW_URL?.replace(/\/$/, "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const accessCode = process.env.DEMO_ACCESS_CODE;

async function call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${accessCode}` };
  if (bypassSecret) headers["x-vercel-protection-bypass"] = bypassSecret;
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  console.log(`${method} ${path} → ${response.status} in ${Date.now() - started} ms`);
  let json: unknown = text.slice(0, 300);
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON, e.g. a platform protection page.
  }
  return { status: response.status, json: json as T };
}

type Detail = {
  drafts: { content_id: string; variant_role: string; status: string; body: string; content_dna: Record<string, string> }[];
  handoff: { schema_version: string; primary_test_variable: string; content_change: { baseline_content_id: string } } | null;
  experiment: { parent_experiment_id: string | null };
};

describe("Two-cycle E2E", () => {
  it("runs Cycle 1 through to Cycle 2 drafts", async () => {
    expect(baseUrl, "Set PREVIEW_URL").toBeTruthy();
    expect(accessCode, "Set DEMO_ACCESS_CODE in .env.local").toBeTruthy();

    const created = await call("POST", "/api/experiments", {
      hypothesis: briefFile.default_hypothesis,
      primary_test_variable: briefFile.default_test_variable,
    });
    expect(created.status, "exp_001 exists? Run npm run demo:reset -- --yes").toBe(201);

    const generated = await call("POST", "/api/experiments/exp_001/drafts", {
      brief: briefFile.brief,
      approved_claim_ids: briefFile.default_claim_ids,
    });
    expect(generated.status, JSON.stringify(generated.json)).toBe(201);

    const first = await call<Detail>("GET", "/api/experiments/exp_001");
    for (const draft of first.json.drafts) {
      console.log(`--- ${draft.content_id} (${draft.variant_role})\n${draft.body}`);
      const decision = await call("POST", `/api/drafts/${draft.content_id}/decision`, { action: "approve", reviewer_role: "content_reviewer" });
      expect(decision.status, JSON.stringify(decision.json)).toBe(200);
    }

    const metrics = await call<{ saved: number; quarantined: unknown[] }>("POST", "/api/experiments/exp_001/metrics", { dataset_id: "demo_fixture_v1" });
    expect(metrics.status, JSON.stringify(metrics.json)).toBe(201);
    console.log(`Saved ${metrics.json.saved} metrics; quarantined ${metrics.json.quarantined.length} rows`);

    const analysis = await call<{
      proposal_id: string;
      status: string;
      review_flags: string[];
      errors: string[];
      analysis: { summary: string; proposal: { primary_test_variable: string; hypothesis: string; content_change: { variant_value: string } } };
    }>("POST", "/api/experiments/exp_001/analysis");
    expect(analysis.status, JSON.stringify(analysis.json)).toBe(201);
    expect(analysis.json.status, JSON.stringify(analysis.json.errors)).toBe("needs_human_approval");
    const { proposal } = analysis.json.analysis;
    console.log(`Flags: ${JSON.stringify(analysis.json.review_flags)}`);
    console.log(`Summary: ${analysis.json.analysis.summary}`);
    console.log(`Next: change ${proposal.primary_test_variable} to: ${proposal.content_change.variant_value}`);

    const decision = await call("POST", `/api/proposals/${analysis.json.proposal_id}/decision`, {
      decision: "approved", reviewer_role: "experiment_approver", outcome: "variant_better",
    });
    expect(decision.status, JSON.stringify(decision.json)).toBe(200);

    const second = await call<Detail>("GET", "/api/experiments/exp_002");
    expect(second.status).toBe(200);
    expect(second.json.experiment.parent_experiment_id).toBe("exp_001");
    expect(second.json.handoff?.schema_version).toBe("1.1");
    const variantDraft = first.json.drafts.find((draft) => draft.variant_role === "variant")!;
    expect(second.json.handoff?.content_change.baseline_content_id).toBe(variantDraft.content_id);
    expect(second.json.drafts.map((draft) => draft.status)).toEqual(["pending_approval", "pending_approval"]);
    const [a, b] = second.json.drafts.map((draft) => draft.content_dna);
    const changed = testVariableSchema.options.filter((field) => a[field] !== b[field]);
    expect(changed).toEqual([proposal.primary_test_variable]);
    for (const draft of second.json.drafts) console.log(`--- ${draft.content_id} (${draft.variant_role})\n${draft.body}`);

    const trace = await call<{ trace: { experiment_id: string }[] }>("GET", "/api/experiments/exp_001/trace");
    expect(trace.json.trace.map((entry) => entry.experiment_id)).toEqual(["exp_001", "exp_002"]);
    console.log("Two-cycle run complete.");
  });
});
