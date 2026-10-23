import { describe, expect, it } from "vitest";
import { ingestFixture } from "@/lib/kpi/ingest";
import { controlRow, drafts, variantRow } from "./fixtures";

describe("ingestFixture", () => {
  it("accepts valid rows and maps them to content drafts", () => {
    const result = ingestFixture([controlRow, variantRow], drafts);

    expect(result.quarantined).toEqual([]);
    expect(result.accepted.map((row) => row.content_id)).toEqual([
      "cnt_001",
      "cnt_002",
    ]);
  });

  it("quarantines a row with a missing count instead of treating it as zero", () => {
    const missing: Record<string, unknown> = { ...controlRow };
    delete missing.landing_page_visits;
    const result = ingestFixture([missing, variantRow], drafts);

    expect(result.accepted.map((row) => row.variant_role)).toEqual(["variant"]);
    expect(result.quarantined).toHaveLength(1);
    expect(result.quarantined[0].index).toBe(0);
    expect(result.quarantined[0].row).toBe(missing);
    expect(result.quarantined[0].reasons.join(" ")).toContain(
      "landing_page_visits"
    );
  });

  it.each([
    ["null", null],
    ["negative", -1],
    ["fractional", 2.5],
    ["numeric string", "250"],
  ])("quarantines a %s count", (_label, value) => {
    const result = ingestFixture(
      [{ ...controlRow, landing_page_visits: value }],
      drafts
    );

    expect(result.accepted).toEqual([]);
    expect(result.quarantined[0].reasons.join(" ")).toContain(
      "landing_page_visits"
    );
  });

  it("quarantines rows that are not labeled simulated", () => {
    const result = ingestFixture([{ ...controlRow, source: "linkedin" }], drafts);

    expect(result.accepted).toEqual([]);
    expect(result.quarantined[0].reasons.join(" ")).toContain("source");
  });

  it("quarantines rows that break the funnel order", () => {
    const result = ingestFixture(
      [{ ...controlRow, demo_requests: 300 }],
      drafts
    );

    expect(result.accepted).toEqual([]);
    expect(result.quarantined[0].reasons).toEqual([
      "demo_requests (300) exceeds landing_page_visits (250)",
    ]);
  });

  it("quarantines rows with no matching content draft", () => {
    const result = ingestFixture(
      [{ ...controlRow, experiment_id: "exp_999" }],
      drafts
    );

    expect(result.accepted).toEqual([]);
    expect(result.quarantined[0].reasons).toEqual([
      "No content draft for experiment_id=exp_999, variant_role=control",
    ]);
  });

  it("quarantines every duplicate row for the same draft", () => {
    const result = ingestFixture(
      [controlRow, variantRow, { ...controlRow, qualified_demo_requests: 12 }],
      drafts
    );

    expect(result.accepted.map((row) => row.variant_role)).toEqual(["variant"]);
    expect(result.quarantined.map((row) => row.index)).toEqual([0, 2]);
    expect(result.quarantined[0].reasons[0]).toContain("Duplicate row");
  });

  it("rejects a fixture that is not an array", () => {
    expect(() => ingestFixture({ rows: [controlRow] }, drafts)).toThrow(
      "Fixture must be an array of rows."
    );
  });
});
