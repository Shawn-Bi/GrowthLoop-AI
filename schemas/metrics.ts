import { z } from "zod";

export const variantRoleSchema = z.enum(["control", "variant"]);
export type VariantRole = z.infer<typeof variantRoleSchema>;

const countSchema = z.number().int().nonnegative();

// One pre-authored, simulated fixture row (PRD §5). Every count is required:
// a missing value is invalid, never treated as zero.
export const fixtureRowSchema = z.object({
  dataset_id: z.string().min(1),
  experiment_id: z.string().min(1),
  variant_role: variantRoleSchema,
  source: z.literal("simulated"),
  impressions: countSchema,
  link_clicks: countSchema,
  landing_page_visits: countSchema,
  demo_requests: countSchema,
  qualified_demo_requests: countSchema,
  notes: z.string().optional(),
});
export type FixtureRow = z.infer<typeof fixtureRowSchema>;

export const countFieldSchema = z.enum([
  "impressions",
  "link_clicks",
  "landing_page_visits",
  "demo_requests",
  "qualified_demo_requests",
]);
export type CountField = z.infer<typeof countFieldSchema>;

export const rateMetricSchema = z.enum([
  // Primary KPI: qualified_demo_requests / landing_page_visits
  "qualified_demo_rate_per_visit",
  // Secondary KPI: qualified_demo_requests / link_clicks
  "qualified_demo_rate_per_click",
]);
export type RateMetric = z.infer<typeof rateMetricSchema>;

const metricBase = {
  metric_id: z.string().min(1),
  dataset_id: z.string().min(1),
  experiment_id: z.string().min(1),
  variant_role: variantRoleSchema,
  content_id: z.string().min(1),
  source: z.literal("simulated"),
};

export const metricRecordSchema = z.discriminatedUnion("kind", [
  z.object({
    ...metricBase,
    kind: z.literal("count"),
    metric: countFieldSchema,
    value: countSchema,
  }),
  z.object({
    ...metricBase,
    kind: z.literal("rate"),
    metric: rateMetricSchema,
    numerator_field: countFieldSchema,
    denominator_field: countFieldSchema,
    numerator: countSchema,
    denominator: countSchema,
    status: z.enum(["calculated", "not_calculable"]),
    value: z.number().nonnegative().nullable(),
    not_calculable_reason: z.string().nullable(),
  }),
]);
export type MetricRecord = z.infer<typeof metricRecordSchema>;
