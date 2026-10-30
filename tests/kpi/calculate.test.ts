import { describe, expect, it } from "vitest";
import { buildMetricRecords, calculateRate } from "@/lib/kpi/calculate";
import { ingestFixture } from "@/lib/kpi/ingest";
import { metricRecordSchema, type MetricRecord } from "@/schemas/metrics";
import { controlRow, drafts, variantRow } from "./fixtures";

function find(records: MetricRecord[], role: string, metric: string) {
  const record = records.find(
    (r) => r.variant_role === role && r.metric === metric
  );
  if (!record) throw new Error(`No ${metric} record for ${role}`);
  return record;
}

describe("calculateRate", () => {
  it("divides valid counts", () => {
    expect(calculateRate(10, 250)).toEqual({ status: "calculated", value: 0.04 });
    expect(calculateRate(18, 240)).toEqual({ status: "calculated", value: 0.075 });
    expect(calculateRate(0, 250)).toEqual({ status: "calculated", value: 0 });
  });

  it("returns not_calculable for a zero denominator, never 0", () => {
    expect(calculateRate(0, 0)).toEqual({
      status: "not_calculable",
      value: null,
      reason: "Denominator is 0.",
    });
  });

  it.each([undefined, null, Number.NaN, -1, 2.5, "250"])(
    "returns not_calculable for denominator %s",
    (denominator) => {
      expect(calculateRate(10, denominator).status).toBe("not_calculable");
    }
  );

  it("returns not_calculable for a missing numerator", () => {
    expect(calculateRate(undefined, 250).status).toBe("not_calculable");
  });
});

describe("buildMetricRecords", () => {
  const { accepted } = ingestFixture([controlRow, variantRow], drafts);
  const records = buildMetricRecords(accepted);

  it("calculates the primary KPI per landing-page visit", () => {
    expect(find(records, "control", "qualified_demo_rate_per_visit")).toMatchObject({
      numerator: 10,
      denominator: 250,
      status: "calculated",
      value: 0.04,
    });
    expect(find(records, "variant", "qualified_demo_rate_per_visit")).toMatchObject({
      numerator: 18,
      denominator: 240,
      value: 0.075,
    });
  });

  it("calculates the secondary KPI per link click", () => {
    expect(find(records, "control", "qualified_demo_rate_per_click")).toMatchObject({
      numerator_field: "qualified_demo_requests",
      denominator_field: "link_clicks",
      numerator: 10,
      denominator: 400,
      value: 0.025,
    });
  });

  it("keeps raw counts as their own metric records", () => {
    expect(find(records, "variant", "demo_requests")).toMatchObject({
      kind: "count",
      value: 30,
    });
  });

  it("marks the primary KPI not_calculable when there are no visits", () => {
    const { accepted: noVisits } = ingestFixture(
      [
        {
          ...controlRow,
          landing_page_visits: 0,
          demo_requests: 0,
          qualified_demo_requests: 0,
        },
      ],
      drafts
    );
    const [primary, secondary] = buildMetricRecords(noVisits);

    expect(primary).toMatchObject({
      metric: "qualified_demo_rate_per_visit",
      status: "not_calculable",
      value: null,
      not_calculable_reason: "Denominator is 0.",
    });
    expect(secondary).toMatchObject({
      metric: "qualified_demo_rate_per_click",
      status: "calculated",
      value: 0,
    });
  });

  it("gives every record a unique, deterministic metric ID linked to its draft", () => {
    const ids = records.map((r) => r.metric_id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(buildMetricRecords(accepted).map((r) => r.metric_id)).toEqual(ids);
    expect(find(records, "control", "qualified_demo_rate_per_visit")).toMatchObject({
      metric_id: "met_test_fixture_exp_001_control_qualified_demo_rate_per_visit",
      content_id: "cnt_001",
      source: "simulated",
    });
  });

  it("produces records that satisfy the metric record schema", () => {
    for (const record of records) {
      expect(metricRecordSchema.safeParse(record).success).toBe(true);
    }
  });
});
