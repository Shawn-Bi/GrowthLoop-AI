import { describe, expect, it, vi } from "vitest";
import { CONTENT_SYSTEM_PROMPT, type ContentAgentInput } from "@/lib/agents/content/prompt";
import { runContentAgent } from "@/lib/agents/content/run";
import { fakeContentOutput, modelResponse } from "./fake-model";

const claims = ["GrantReady is designed to show upcoming grant deadlines in one place."];
const input = (primary_test_variable: ContentAgentInput["primary_test_variable"] = "hook"): ContentAgentInput => ({
  experiment_id: "exp_001",
  hypothesis: "h",
  primary_test_variable,
  product_description: "Hypothetical.",
  brief: { audience: "Directors", campaignGoal: "Invite", keyMessage: "One place." },
  icp: { icp_version: "v1", icp_id: "icp", label: "Directors", role: "r", organization: "o", channel: "linkedin_organic", working_assumptions: ["a"], evidence_note: "n" },
  approved_claims: claims,
  rejected_claims: ["GrantReady raises grant success rates."],
  banned_phrases: ["guarantee"],
});

const clientReturning = (...outputs: unknown[]) => {
  const create = vi.fn();
  for (const output of outputs) create.mockResolvedValueOnce(modelResponse(output));
  return { create, client: { messages: { create } } as never };
};
const valid = fakeContentOutput({ primary_test_variable: "hook", approved_claims: claims });

describe("runContentAgent", () => {
  it("returns validated output and records usage as a content run", async () => {
    const { client, create } = clientReturning(valid);

    const result = await runContentAgent(client, "test-model", input());

    expect(result).toMatchObject({ ok: true, output: valid });
    expect(result.run).toMatchObject({ agent: "content", status: "completed", attempts: 1, input_tokens: 100 });
    expect(create.mock.calls[0][0].system).toBe(CONTENT_SYSTEM_PROMPT);
    expect(create.mock.calls[0][0].output_config.format).toBeDefined();
  });

  it("gives the agent only the approved context", async () => {
    const { client, create } = clientReturning(valid);

    await runContentAgent(client, "test-model", input());

    const sent = JSON.parse(create.mock.calls[0][0].messages[0].content.split("\n\n")[1]);
    expect(sent).toMatchObject({ approved_claims: claims, banned_phrases: ["guarantee"], primary_test_variable: "hook" });
    expect(Object.keys(sent)).not.toContain("metrics");
  });

  it.each([
    ["an approved claim is missing", { ...valid, control: { ...valid.control, evidence: "Something else." } }, "must repeat this approved claim"],
    ["the claim was reworded", { ...valid, control: { ...valid.control, evidence: claims[0].toLowerCase() } }, "must repeat this approved claim"],
    ["a banned phrase appears", { ...valid, variant_value: "Guaranteed results." }, 'banned phrase "guarantee"'],
    ["a rejected claim appears", { ...valid, control: { ...valid.control, hook: "GrantReady raises grant success rates." } }, "rejected claim"],
    ["the variant matches the control", { ...valid, variant_value: valid.control.hook }, "must differ"],
  ])("repairs once when %s", async (_name, bad, issue) => {
    const { client, create } = clientReturning(bad, valid);

    const result = await runContentAgent(client, "test-model", input());

    expect(result).toMatchObject({ ok: true, run: { attempts: 2 } });
    expect(create.mock.calls[1][0].messages.at(-1).content).toContain(issue);
  });

  it("fails visibly after one repair", async () => {
    const bad = { ...valid, variant_value: "Guaranteed results." };
    const { client, create } = clientReturning(bad, bad);

    const result = await runContentAgent(client, "test-model", input());

    expect(result).toMatchObject({ ok: false, run: { status: "error", attempts: 2 } });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("requires the claims in an evidence variant too", async () => {
    const control = fakeContentOutput({ primary_test_variable: "evidence", approved_claims: claims }).control;
    const { client } = clientReturning({ control, variant_value: "No claims here." }, { control, variant_value: "Still none." });

    const result = await runContentAgent(client, "test-model", input("evidence"));

    expect(result.ok).toBe(false);
  });

  it("fails visibly on a refusal", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [], stop_reason: "refusal", stop_details: { category: "cyber" }, usage: { input_tokens: 1, output_tokens: 0 },
    });

    const result = await runContentAgent({ messages: { create } } as never, "test-model", input());

    expect(result).toMatchObject({ ok: false, run: { stop_reason: "refusal" } });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
