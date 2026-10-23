import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { toProposalRecord } from "@/lib/agents/analytics/proposal";
import { runAnalyticsAgent } from "@/lib/agents/analytics/run";
import { buildMetricRecords } from "@/lib/kpi/calculate";
import { ingestFixture } from "@/lib/kpi/ingest";
import { controlRow, drafts, variantRow } from "../tests/kpi/fixtures";

// S1: real Anthropic call through the analytics adapter. Costs tokens.
// Prints only presence flags, model ID, stop reason, usage and latency.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const model = process.env.ANTHROPIC_MODEL;
const client = new Anthropic({ timeout: 90_000 });

describe("S1 Anthropic smoke", () => {
  it("has a model configured", () => {
    console.log(
      `ANTHROPIC_API_KEY present: ${Boolean(process.env.ANTHROPIC_API_KEY)}`
    );
    expect(model, "Set ANTHROPIC_MODEL in .env.local").toBeTruthy();
  });

  it.skipIf(!model)("retrieves the configured model", async () => {
    const info = await client.models.retrieve(model!);

    console.log(`Model available: ${info.id}`);
    expect(info.id).toBeTruthy();
  });

  it.skipIf(!model)("returns a schema-valid analytics proposal", async () => {
    const metrics = buildMetricRecords(
      ingestFixture([controlRow, variantRow], drafts).accepted
    );
    const result = await runAnalyticsAgent(client, model!, {
      experiment_id: "exp_001",
      metrics,
      drafts: [
        { content_id: "cnt_001", variant_role: "control", content_dna: { hook: "question about grant deadlines" } },
        { content_id: "cnt_002", variant_role: "variant", content_dna: { hook: "pain point: missed grant deadlines" } },
      ],
    });

    console.log("Agent run:", JSON.stringify(result.run));
    expect(result.ok, result.ok ? "" : result.error).toBe(true);

    if (result.ok) {
      const proposal = toProposalRecord("prop_smoke", "exp_001", result.output, metrics);
      console.log(
        `Proposal status: ${proposal.status}; review flags: ${proposal.review_flags.length}; errors: ${proposal.errors.length}`
      );
      expect(proposal.status).not.toBe("error");
    }
  });
});
