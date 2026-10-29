import { describe, expect, it } from "vitest";
import { reviewAnalysis } from "@/lib/agents/analytics/review";
import { controlPrimary, metrics, validOutput } from "./fixtures";

describe("reviewAnalysis", () => {
  it("passes a well-cited, one-variable analysis with no flags", () => {
    expect(reviewAnalysis(validOutput(), metrics)).toEqual({
      ok: true,
      review_flags: [],
    });
  });

  it("blocks findings that cite metric IDs that don't exist", () => {
    const output = validOutput();
    output.findings[0].metric_ids = ["met_invented"];

    expect(reviewAnalysis(output, metrics)).toEqual({
      ok: false,
      errors: ["Unknown metric_id: met_invented"],
    });
  });

  it("blocks proposals that cite unknown metric IDs", () => {
    const output = validOutput();
    output.proposal.metric_ids.push("met_other_experiment");

    expect(reviewAnalysis(output, metrics).ok).toBe(false);
  });

  it("flags numbers that don't match the cited metrics", () => {
    const output = validOutput();
    output.findings[1].statement =
      "Variant: 9.2% qualified demo rate per visit, 3.5 points above control.";

    const review = reviewAnalysis(output, metrics);

    expect(review).toEqual({
      ok: true,
      review_flags: [
        'Finding 2 mentions "9.2%", which doesn\'t match its cited metrics.',
        'Finding 2 mentions "3.5", which doesn\'t match its cited metrics.',
      ],
    });
  });

  it("accepts rounded rates and the rate's numerator and denominator", () => {
    const output = validOutput();
    output.findings[1].statement =
      "Variant converted about 8% of visits (18 of 240), or 0.075 per visit.";

    expect(reviewAnalysis(output, metrics)).toEqual({
      ok: true,
      review_flags: [],
    });
  });

  it("flags numbers in the summary that no cited metric supports", () => {
    const output = validOutput();
    output.summary = "The variant nearly doubled conversions to 12%.";

    const review = reviewAnalysis(output, metrics);

    expect(review.ok && review.review_flags).toEqual([
      'Summary mentions "12%", which doesn\'t match any cited metric.',
    ]);
  });

  it("ignores digits inside IDs", () => {
    const output = validOutput();
    output.summary = "Results for exp_001 and handoff v1.0.";

    expect(reviewAnalysis(output, metrics)).toEqual({
      ok: true,
      review_flags: [],
    });
  });

  it("blocks proposals that change more than one variable", () => {
    const output = validOutput();
    output.proposal.changed_dimensions = ["hook", "cta"];

    const review = reviewAnalysis(output, metrics);

    expect(review).toEqual({
      ok: false,
      errors: [
        "One-variable test required: the proposal changes hook, cta, but it may change only its primary test variable, hook. Run the analysis again.",
      ],
    });
  });

  it("blocks proposals whose changed dimension isn't the primary test variable", () => {
    const output = validOutput();
    output.proposal.changed_dimensions = ["cta"];

    const review = reviewAnalysis(output, metrics);

    expect(review.ok).toBe(false);
    expect(!review.ok && review.errors[0]).toContain("changes cta");
  });

  it("flags causal or overconfident wording", () => {
    const output = validOutput();
    output.proposal.hypothesis =
      "A pain-point hook will increase demo requests, as the variant proved.";

    const review = reviewAnalysis(output, metrics);

    expect(review.ok && review.review_flags).toEqual([
      'Possible causal or overconfident wording: "proved".',
      'Possible causal or overconfident wording: "will increase".',
    ]);
  });

  it("flags findings that cite a not_calculable metric", () => {
    const zeroVisits = metrics.map((metric) =>
      metric.metric_id === controlPrimary && metric.kind === "rate"
        ? {
            ...metric,
            status: "not_calculable" as const,
            value: null,
            not_calculable_reason: "Denominator is 0.",
          }
        : metric
    );
    const output = validOutput();
    output.findings[0].statement =
      "Control has no calculable rate per landing-page visit.";

    const review = reviewAnalysis(output, zeroVisits);

    expect(review.ok && review.review_flags).toEqual([
      `Finding 1 cites ${controlPrimary}, which is not_calculable.`,
    ]);
  });
});
