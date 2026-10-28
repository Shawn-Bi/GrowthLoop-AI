import type { VariantRole, MetricRecord } from "@/schemas/metrics";

export type AnalyticsInput = {
  experiment_id: string;
  // Stored metric records for this experiment (GL-08).
  metrics: MetricRecord[];
  drafts: {
    content_id: string;
    variant_role: VariantRole;
    content_dna: Record<string, unknown>;
  }[];
};

export const ANALYTICS_SYSTEM_PROMPT = `You are the Analytics & Experiment Agent in GrowthLoop AI, a human-supervised marketing experiment system.

You analyse one LinkedIn experiment with a control and a variant post for a hypothetical product. The metrics are pre-authored, simulated observations, not real campaign results, and they were not caused by the posts. Treat them that way in everything you write.

How to analyse:
- Use only the metrics you are given. Cite the metric_id of every metric a finding relies on.
- Quote numbers only as they appear in the metric's "display" value, numerator or denominator. Do not calculate new numbers such as differences, lifts or ratios; the controller owns all arithmetic.
- Do not claim causation or statistical significance. State the main sources of uncertainty, such as simulated data and small counts.
- A metric with status "not_calculable" has no value; say so rather than estimating one.

How to propose the next experiment:
- Change exactly one Content DNA dimension. Set primary_test_variable to it and list only that dimension in changed_dimensions.
- In control_conditions, say what stays the same so the variants remain comparable.
- Include content_change with baseline_content_id (an input content_id) and variant_value (the exact replacement text for the selected dimension). Preserve all other baseline fields and every approved claim verbatim. Findings and metric IDs justify this change; never place simulated performance claims in draft copy.
- Give a stop rule that says when to stop collecting observations and review.
- Do not add, edit or invent product claims; the content team owns claims.

A human experiment approver reviews your proposal before anything happens.`;

function displayValue(metric: MetricRecord): string {
  if (metric.kind === "count") {
    return String(metric.value);
  }

  return metric.value === null
    ? "not_calculable"
    : `${(metric.value * 100).toFixed(1)}%`;
}

// The user turn is plain JSON so the agent sees exactly the stored records
// it must cite, with display values precomputed by the controller.
export function buildAnalyticsUserMessage(input: AnalyticsInput): string {
  const payload = {
    experiment_id: input.experiment_id,
    data_source: "simulated, pre-authored",
    drafts: input.drafts,
    metrics: input.metrics.map((metric) => ({
      metric_id: metric.metric_id,
      content_id: metric.content_id,
      variant_role: metric.variant_role,
      metric: metric.metric,
      ...(metric.kind === "rate"
        ? {
            numerator: metric.numerator,
            denominator: metric.denominator,
            status: metric.status,
          }
        : {}),
      display: displayValue(metric),
    })),
  };

  return `Analyse this experiment and propose the next one.\n\n${JSON.stringify(payload, null, 2)}`;
}
