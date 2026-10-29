import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertCanStartNextCycle,
  assertOutcomeAllowed,
  chooseBaseline,
  maxExperimentCycles,
  primaryKpiCalculable,
} from "@/lib/controller/cycle-rules";
import type { MetricRecord } from "@/schemas/metrics";
import { metrics } from "../analytics/fixtures";

afterEach(() => vi.unstubAllEnvs());

describe("maxExperimentCycles", () => {
  it("defaults to the two-cycle PRD demo", () => {
    vi.stubEnv("MAX_EXPERIMENT_CYCLES", "");
    expect(maxExperimentCycles()).toBe(2);
  });

  it("reads MAX_EXPERIMENT_CYCLES", () => {
    vi.stubEnv("MAX_EXPERIMENT_CYCLES", "3");
    expect(maxExperimentCycles()).toBe(3);
  });

  it.each(["0", "-1", "2.5", "two"])("refuses %s", (value) => {
    vi.stubEnv("MAX_EXPERIMENT_CYCLES", value);
    expect(() => maxExperimentCycles()).toThrow("positive whole number");
  });
});

describe("assertCanStartNextCycle", () => {
  it("lets cycle 1 start cycle 2 and stops at cycle 2", () => {
    expect(() => assertCanStartNextCycle("exp_001", 1)).not.toThrow();
    expect(() => assertCanStartNextCycle("exp_002", 2)).toThrow(
      expect.objectContaining({ httpStatus: 409, message: expect.stringContaining("cycle 2 of 2") })
    );
  });
});

describe("chooseBaseline", () => {
  const drafts = [
    { id: "cnt_c", variantRole: "control" },
    { id: "cnt_v", variantRole: "variant" },
  ];

  it("moves the baseline to the variant only when the variant did better", () => {
    expect(chooseBaseline("variant_better", drafts)).toBe("cnt_v");
    expect(chooseBaseline("control_better", drafts)).toBe("cnt_c");
    expect(chooseBaseline("inconclusive", drafts)).toBe("cnt_c");
  });

  it("needs exactly one draft in the chosen role", () => {
    expect(() => chooseBaseline("variant_better", [drafts[0]])).toThrow("exactly one variant");
  });
});

describe("primaryKpiCalculable and assertOutcomeAllowed", () => {
  const notCalculable = metrics.map((metric): MetricRecord =>
    metric.kind === "rate" && metric.variant_role === "control" && metric.metric === "qualified_demo_rate_per_visit"
      ? { ...metric, status: "not_calculable", value: null, not_calculable_reason: "Denominator is 0." }
      : metric
  );

  it("needs a calculated primary KPI for both variants", () => {
    expect(primaryKpiCalculable(metrics)).toBe(true);
    expect(primaryKpiCalculable(notCalculable)).toBe(false);
    expect(primaryKpiCalculable(metrics.filter((metric) => metric.variant_role === "control"))).toBe(false);
  });

  it("allows only inconclusive when the primary KPI isn't calculable", () => {
    expect(() => assertOutcomeAllowed("inconclusive", false)).not.toThrow();
    expect(() => assertOutcomeAllowed("variant_better", false)).toThrow(
      expect.objectContaining({ httpStatus: 409 })
    );
    expect(() => assertOutcomeAllowed("control_better", true)).not.toThrow();
  });
});
