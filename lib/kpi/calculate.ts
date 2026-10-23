import {
  countFieldSchema,
  type CountField,
  type MetricRecord,
  type RateMetric,
} from "@/schemas/metrics";
import type { AcceptedRow } from "./ingest";

export type RateResult =
  | { status: "calculated"; value: number }
  | { status: "not_calculable"; value: null; reason: string };

const RATE_DEFINITIONS: {
  metric: RateMetric;
  numerator_field: CountField;
  denominator_field: CountField;
}[] = [
  {
    metric: "qualified_demo_rate_per_visit",
    numerator_field: "qualified_demo_requests",
    denominator_field: "landing_page_visits",
  },
  {
    metric: "qualified_demo_rate_per_click",
    numerator_field: "qualified_demo_requests",
    denominator_field: "link_clicks",
  },
];

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

// A zero, missing or invalid denominator is not_calculable, never 0 (PRD §5).
export function calculateRate(
  numerator: unknown,
  denominator: unknown
): RateResult {
  if (!isCount(denominator)) {
    return {
      status: "not_calculable",
      value: null,
      reason: "Denominator is missing or invalid.",
    };
  }

  if (denominator === 0) {
    return {
      status: "not_calculable",
      value: null,
      reason: "Denominator is 0.",
    };
  }

  if (!isCount(numerator)) {
    return {
      status: "not_calculable",
      value: null,
      reason: "Numerator is missing or invalid.",
    };
  }

  return { status: "calculated", value: numerator / denominator };
}

// Deterministic, so recomputing the same dataset yields the same IDs that
// analysis findings cite.
export function metricId(
  row: Pick<AcceptedRow, "dataset_id" | "experiment_id" | "variant_role">,
  metric: CountField | RateMetric
): string {
  return `met_${row.dataset_id}_${row.experiment_id}_${row.variant_role}_${metric}`;
}

// Primary and secondary KPIs plus raw counts for each accepted row.
export function buildMetricRecords(rows: AcceptedRow[]): MetricRecord[] {
  return rows.flatMap((row) => {
    const base = {
      dataset_id: row.dataset_id,
      experiment_id: row.experiment_id,
      variant_role: row.variant_role,
      content_id: row.content_id,
      source: row.source,
    };

    const rates: MetricRecord[] = RATE_DEFINITIONS.map((definition) => {
      const numerator = row[definition.numerator_field];
      const denominator = row[definition.denominator_field];
      const result = calculateRate(numerator, denominator);

      return {
        ...base,
        metric_id: metricId(row, definition.metric),
        kind: "rate" as const,
        ...definition,
        numerator,
        denominator,
        status: result.status,
        value: result.value,
        not_calculable_reason:
          result.status === "not_calculable" ? result.reason : null,
      };
    });

    const counts: MetricRecord[] = countFieldSchema.options.map((field) => ({
      ...base,
      metric_id: metricId(row, field),
      kind: "count" as const,
      metric: field,
      value: row[field],
    }));

    return [...rates, ...counts];
  });
}
