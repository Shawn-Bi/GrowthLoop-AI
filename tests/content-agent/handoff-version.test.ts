import { expect, it } from "vitest";
import { receiveContentHandoff } from "@/lib/content-agent/handoff";

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

it("accepts a v1.1 Cycle 1 handoff", () => {
  expect(receiveContentHandoff(cycle1, brief, registry, undefined, () => {})).toHaveLength(2);
});

it("rejects a v1.0 handoff", () => {
  expect(reject({ ...cycle1, schema_version: "1.0" })).toEqual(["schema_version"]);
});

it("rejects a Cycle 2 handoff without content_change", () => {
  expect(reject(cycle2)).toEqual(["content_change"]);
});
