import { describe, expect, it } from "vitest";
import { receiveContentHandoff } from "@/lib/content-agent/handoff";
import { validDna } from "../persistence/dna";
import { fakeContentOutput } from "./fake-model";

// Handoff v1.1 (PR #13 decision 4): the Content Agent parses with the shared
// schema, so it rejects v1.0 payloads and Cycle 2 payloads without a change.
const brief = { audience: "Nonprofit teams", campaignGoal: "Review a hypothetical product", keyMessage: "GrantReady is hypothetical." };
const registry = [{ id: "clm_ok", text: "GrantReady is hypothetical.", status: "approved" as const }];
const cycle1 = {
  schema_version: "1.1", task_id: "t", correlation_id: "c", idempotency_key: "k", experiment_id: "exp_001",
  parent_experiment_id: null, source_content_ids: [], approved_claim_ids: ["clm_ok"], hypothesis: "h",
  primary_test_variable: "hook", control_conditions: ["fixed"], metric_ids: [], findings: [],
  uncertainty: "simulated", approval_state: "approved", next_action: "generate_content_drafts",
};
const cycle2 = {
  ...cycle1, experiment_id: "exp_002", parent_experiment_id: "exp_001",
  source_content_ids: ["cnt_exp_001_control", "cnt_exp_001_variant"], metric_ids: ["m1"],
  findings: [{ statement: "Simulated finding.", metric_ids: ["m1"] }],
};
const reject = (payload: unknown) => {
  const events: { side: string; missing_or_rejected: string[] }[] = [];
  expect(() => receiveContentHandoff(payload, brief, registry, undefined, (event) => events.push(event))).toThrow("Invalid Content handoff");
  return events.find((event) => event.side === "content_reject" && event.missing_or_rejected.length > 0)?.missing_or_rejected;
};

const generated = fakeContentOutput({ primary_test_variable: "hook", approved_claims: ["GrantReady is hypothetical."] });

it("accepts a v1.1 Cycle 1 handoff", () => {
  expect(receiveContentHandoff(cycle1, brief, registry, undefined, () => {}, { generated })).toHaveLength(2);
});

it("has no template fallback: Cycle 1 needs the Content Agent's output", () => {
  expect(() => receiveContentHandoff(cycle1, brief, registry, undefined, () => {})).toThrow("Content Agent's output");
});

it("refuses a banned phrase or rejected claim wording in Content Agent output", () => {
  const banned = { ...generated, variant_value: "Guaranteed grant award." };
  expect(() => receiveContentHandoff(cycle1, brief, registry, undefined, () => {}, { generated: banned })).toThrow("banned phrase");
  const rejected = { ...generated, variant_value: "GrantReady raises grant success rates." };
  expect(() => receiveContentHandoff(cycle1, brief, registry, undefined, () => {}, {
    generated: rejected, rejectedClaimTexts: ["GrantReady raises grant success rates."],
  })).toThrow("rejected claim");
});

// Direct calls can't skip the Cycle 2 checks (PR #16 and #17, F15–F17).
describe("direct Cycle 2 calls", () => {
  const handoff = { ...cycle2, correlation_id: "c", content_change: { baseline_content_id: "cnt_exp_001_control", variant_value: "A new hook." } };
  const baseline = validDna({
    claim_ids_used: ["clm_ok"], evidence: "GrantReady is hypothetical.",
    generation_context: { ...validDna().generation_context, correlation_id: "c", experiment_id: "exp_001" },
  });
  const call = (input: unknown, dna = baseline) => receiveContentHandoff(input, brief, registry, dna, () => {});

  it("accepts a matching baseline", () => {
    expect(call(handoff)).toHaveLength(2);
  });

  it("rejects findings that cite metrics outside the handoff", () => {
    const findings = [{ statement: "Simulated finding.", metric_ids: ["m_unknown"] }];
    expect(() => call({ ...handoff, findings })).toThrow("outside the handoff");
  });

  it("rejects a baseline from another experiment or correlation chain", () => {
    const context = baseline.generation_context;
    expect(() => call(handoff, { ...baseline, generation_context: { ...context, experiment_id: "exp_009" } })).toThrow("parent experiment");
    expect(() => call(handoff, { ...baseline, generation_context: { ...context, correlation_id: "other" } })).toThrow("parent experiment");
  });

  it("rejects changed claim provenance", () => {
    expect(() => call(handoff, { ...baseline, claim_ids_used: ["clm_other"] })).toThrow("Baseline claims");
  });
});

it("rejects a v1.0 handoff", () => {
  expect(reject({ ...cycle1, schema_version: "1.0" })).toEqual(["schema_version"]);
});

it("rejects a Cycle 2 handoff without content_change", () => {
  expect(reject(cycle2)).toEqual(["content_change"]);
});
