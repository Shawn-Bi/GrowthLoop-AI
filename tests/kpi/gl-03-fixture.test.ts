import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildMetricRecords, calculateRate } from "@/lib/kpi/calculate";
import { ingestFixture } from "@/lib/kpi/ingest";
import { fixtureRowSchema, metricRecordSchema } from "@/schemas/metrics";

const fixture = JSON.parse(readFileSync(new URL("../../data/fixtures/demo_fixture_v1.json", import.meta.url), "utf8"));
const expected = JSON.parse(readFileSync(new URL("../../data/fixtures/expected.json", import.meta.url), "utf8"));
const drafts = ["control", "variant"].map((variant_role) => ({ experiment_id: "exp_001", variant_role: variant_role as "control" | "variant", content_id: `gl03_${variant_role}` }));
const ingestion = ingestFixture(fixture, drafts);
const records = buildMetricRecords(ingestion.accepted);

describe("GL-03: approved simulated, pre-authored data (not campaign results)", () => {
  it("keeps the supplied provenance and validates every row's structural schema", () => {
    expect(fixture).toHaveLength(4);
    for (const row of fixture) {
      expect(fixtureRowSchema.safeParse(row).success).toBe(true);
      expect(row).toMatchObject({ dataset_id: expected.dataset_id, experiment_id: expected.experiment_id, source: "simulated" });
    }
    expect(expected.source).toBe("simulated");
  });
  it("accepts only the two valid rows and quarantines the invalid examples with exact reasons", () => {
    expect(ingestion.accepted).toHaveLength(expected.expected_ingestion.accepted_row_count);
    expect(ingestion.quarantined).toHaveLength(expected.expected_ingestion.quarantined_row_count);
    expect(ingestion.quarantined.map((row) => ({ index: row.index, role: (row.row as { variant_role: string }).variant_role, reasons: row.reasons })))
      .toEqual(expected.invalid_rows.map((row: { index_zero_based: number; variant_role: string; reason: string }) => ({ index: row.index_zero_based, role: row.variant_role, reasons: [row.reason] })));
    expect(ingestion.accepted.map((row) => row.content_id)).toEqual(["gl03_control", "gl03_variant"]);
  });
  it.each(expected.valid_rows)("matches both independent KPIs for $variant_role", (row) => {
    const accepted = ingestion.accepted.find((item) => item.variant_role === row.variant_role)!;
    expect(accepted.qualified_demo_requests).toBe(row.numerator_qualified_demo_requests);
    expect(accepted.landing_page_visits).toBe(row.primary_denominator_landing_page_visits);
    expect(accepted.link_clicks).toBe(row.secondary_denominator_link_clicks);
    for (const [kpi, denominator] of [[row.primary_kpi, accepted.landing_page_visits], [row.secondary_kpi, accepted.link_clicks]] as const) {
      const record = records.find((item) => item.variant_role === row.variant_role && item.metric === kpi.metric)!;
      expect(record).toMatchObject({ kind: "rate", numerator: accepted.qualified_demo_requests, denominator,
        status: kpi.status, value: kpi.value, source: "simulated", dataset_id: "demo_fixture_v1", experiment_id: "exp_001" });
      expect(kpi.value * 100).toBeCloseTo(kpi.percent, 10);
      expect(calculateRate(accepted.qualified_demo_requests, denominator)).toEqual({ status: "calculated", value: kpi.value });
    }
  });
  it("matches independently supplied synthetic percentage-point differences", () => {
    const [control, variant] = expected.valid_rows;
    expect((variant.primary_kpi.value - control.primary_kpi.value) * 100).toBeCloseTo(expected.comparison.primary_absolute_percentage_point_difference, 10);
    expect((variant.secondary_kpi.value - control.secondary_kpi.value) * 100).toBeCloseTo(expected.comparison.secondary_absolute_percentage_point_difference, 10);
    expect(expected.comparison.interpretation).toContain("not");
  });
  it("emits only schema-valid metric records for accepted rows", () => {
    expect(records).toHaveLength(14);
    for (const record of records) expect(metricRecordSchema.safeParse(record).success).toBe(true);
    expect(records.filter((item) => item.kind === "count" && item.metric === "qualified_demo_requests").map((item) => item.value)).toEqual([8, 15]);
  });
  it("keeps the all-zero unit case separate and returns null, never 0%, for both rates", () => {
    const zero = expected.zero_denominator_unit_case;
    for (const [denominator, kpi] of [[zero.landing_page_visits, zero.primary_kpi], [zero.link_clicks, zero.secondary_kpi]]) {
      const result = calculateRate(zero.qualified_demo_requests, denominator);
      expect(result).toMatchObject({ status: kpi.status, value: kpi.value });
      expect(result).toEqual({ status: "not_calculable", value: null, reason: "Denominator is 0." });
    }
    const separate = ingestFixture([{ dataset_id: "gl03_zero_unit", experiment_id: "exp_zero", variant_role: "control", source: "simulated",
      impressions: 0, link_clicks: 0, landing_page_visits: 0, demo_requests: 0, qualified_demo_requests: 0 }],
      [{ experiment_id: "exp_zero", variant_role: "control", content_id: "gl03_zero" }]);
    expect(separate.quarantined).toEqual([]);
    const rates = buildMetricRecords(separate.accepted).filter((item) => item.kind === "rate");
    expect(rates).toHaveLength(2);
    for (const rate of rates) expect(rate).toMatchObject({ status: "not_calculable", value: null, not_calculable_reason: "Denominator is 0." });
    expect(fixture).toHaveLength(4);
  });
  it.each([undefined, null, -1, 1.5, "80"])("returns not_calculable for missing/invalid denominator %s", (value) => {
    expect(calculateRate(8, value)).toMatchObject({ status: "not_calculable", value: null });
  });
});
