import type { ContentDna } from "@/schemas/content";

// A Content DNA 1.0 record that passes contentDnaSchema, for tests that
// approve drafts directly. Test-only text, not Michelle's GrantReady copy.
export function validDna(overrides: Partial<ContentDna> = {}): ContentDna {
  return {
    schema_version: "1.0",
    icp: "Nonprofit grant teams",
    channel: "linkedin_organic",
    primary_test_variable: "hook",
    variant_role: "control",
    claim_ids_used: ["clm_ok"],
    pain_point: "Grant deadlines slip.",
    hook: "Missed a grant deadline?",
    value_proposition: "One place to track deadlines.",
    evidence: "ok",
    cta: "Book a demo.",
    brief: { audience: "Nonprofit grant teams", campaignGoal: "Test demo", keyMessage: "Hypothetical product." },
    generation_context: {
      correlation_id: "corr_exp_001",
      experiment_id: "exp_001",
      findings: [],
      metric_ids: [],
      approval_state: "approved",
      parent_experiment_id: null,
    },
    ...overrides,
  };
}
