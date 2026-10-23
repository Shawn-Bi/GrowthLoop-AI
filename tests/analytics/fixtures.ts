import { buildMetricRecords, metricId } from "@/lib/kpi/calculate";
import { ingestFixture } from "@/lib/kpi/ingest";
import type { AnalyticsOutput, ProposalRecord } from "@/schemas/analytics";
import { controlRow, drafts, variantRow } from "../kpi/fixtures";

export const metrics = buildMetricRecords(
  ingestFixture([controlRow, variantRow], drafts).accepted
);

const ref = { dataset_id: "test_fixture", experiment_id: "exp_001" };
export const controlPrimary = metricId(
  { ...ref, variant_role: "control" },
  "qualified_demo_rate_per_visit"
);
export const variantPrimary = metricId(
  { ...ref, variant_role: "variant" },
  "qualified_demo_rate_per_visit"
);

export function validOutput(): AnalyticsOutput {
  return {
    summary:
      "In this simulated dataset the variant recorded a higher qualified demo rate per landing-page visit than the control.",
    findings: [
      {
        statement:
          "Control: 4.0% qualified demo rate per landing-page visit (10 of 250 visits).",
        metric_ids: [controlPrimary],
      },
      {
        statement:
          "Variant: 7.5% qualified demo rate per landing-page visit (18 of 240 visits).",
        metric_ids: [variantPrimary],
      },
    ],
    uncertainty:
      "Pre-authored simulated data with small counts; the difference is not evidence of real or causal lift.",
    proposal: {
      hypothesis:
        "Opening with the grant-deadline pain point may raise qualified demo requests per landing-page visit.",
      primary_test_variable: "hook",
      changed_dimensions: ["hook"],
      control_conditions: [
        "Keep ICP, pain point, value proposition, evidence, CTA and channel unchanged.",
      ],
      stop_rule:
        "Stop once each variant has 250 landing-page visits, then review before any further test.",
      metric_ids: [controlPrimary, variantPrimary],
    },
  };
}

export function pendingProposal(): ProposalRecord {
  return {
    proposal_id: "prop_001",
    experiment_id: "exp_001",
    analysis: validOutput(),
    status: "needs_human_approval",
    errors: [],
    review_flags: [],
    decided_by_role: null,
    decided_at: null,
  };
}
