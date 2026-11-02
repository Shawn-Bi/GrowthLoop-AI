import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import claimsFile from "@/data/seed/claims.json";
import { runContentAgent } from "@/lib/agents/content/run";
import { bannedPhrases, grantReadyBrief, grantReadyIcp } from "@/lib/content-agent/seed";
import { testVariableSchema } from "@/schemas/analytics";

// S1b: real Anthropic call through the Content Agent adapter, once for each
// test variable. Costs tokens. Prints the run records and the copy, which is
// hypothetical demo text.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const model = process.env.ANTHROPIC_MODEL;
const client = new Anthropic({ timeout: 90_000 });
const byId = new Map(claimsFile.claims.map((claim) => [claim.claim_id, claim.text]));

describe("S1b Content Agent smoke", () => {
  it.skipIf(!model).each(testVariableSchema.options)("returns valid drafts testing %s", async (variable) => {
    const result = await runContentAgent(client, model!, {
      experiment_id: "exp_smoke_content",
      hypothesis: grantReadyBrief.default_hypothesis,
      primary_test_variable: variable,
      product_description: grantReadyBrief.product_description,
      brief: grantReadyBrief.brief,
      icp: grantReadyIcp,
      approved_claims: grantReadyBrief.default_claim_ids.map((id) => byId.get(id)!),
      rejected_claims: claimsFile.claims.filter((claim) => claim.status === "rejected_claim").map((claim) => claim.text),
      banned_phrases: bannedPhrases,
    });

    console.log("Agent run:", JSON.stringify({ ...result.run, model: undefined }));
    expect(result.ok, result.ok ? "" : result.error).toBe(true);
    if (result.ok) {
      console.log(`Control ${variable}: ${result.output.control[variable]}`);
      console.log(`Variant ${variable}: ${result.output.variant_value}`);
    }
  });
});
