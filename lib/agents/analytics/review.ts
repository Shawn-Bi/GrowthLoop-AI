import type { AnalyticsOutput } from "@/schemas/analytics";
import type { MetricRecord } from "@/schemas/metrics";

export type AnalysisReview =
  | { ok: true; review_flags: string[] }
  | { ok: false; errors: string[] };

// Keyword checks only surface likely causal or overconfident wording for the
// human reviewer; they are not a complete safeguard (PRD §5).
const CAUSAL_PATTERNS = [
  /\bcaus(e|ed|es|ing)\b/i,
  /\bprov(e|ed|es|en)\b/i,
  /\bsignifican(t|tly|ce)\b/i,
  /\bguarantee/i,
  /\bdrove\b/i,
  /\bwill (increase|improve|boost|double|raise)\b/i,
];

// A number not glued to letters, underscores or other digits, so IDs like
// exp_001 or v1.0 are skipped.
const NUMBER_PATTERN = /(?<![\w.])(\d+(?:\.\d+)?)(%?)(?!\w|\.\d)/g;

type NumberToken = {
  text: string;
  value: number;
  decimals: number;
  percent: boolean;
};

function numberTokens(text: string): NumberToken[] {
  return [...text.matchAll(NUMBER_PATTERN)].map((match) => ({
    text: match[0],
    value: Number(match[1]),
    decimals: match[1].split(".")[1]?.length ?? 0,
    percent: match[2] === "%",
  }));
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// True when the number is a count, numerator, denominator or (rounded) rate
// of one of the cited metrics.
function matchesMetric(token: NumberToken, metrics: MetricRecord[]): boolean {
  return metrics.some((metric) => {
    if (metric.kind === "count") {
      return !token.percent && token.value === metric.value;
    }

    if (
      !token.percent &&
      (token.value === metric.numerator || token.value === metric.denominator)
    ) {
      return true;
    }

    if (metric.value === null) {
      return false;
    }

    const scaled = token.percent ? metric.value * 100 : metric.value;
    return round(scaled, token.decimals) === token.value;
  });
}

function unverifiedNumbers(text: string, cited: MetricRecord[]): string[] {
  return numberTokens(text)
    .filter((token) => !matchesMetric(token, cited))
    .map((token) => token.text);
}

// Checks an Analytics Agent output against the stored metrics it was given.
// Unknown metric IDs are fabricated evidence, and a proposal that changes
// anything other than its one primary test variable breaks the strict A/B
// rule agreed on PR #13; both block the proposal. Other concerns become
// review flags for the human approver.
export function reviewAnalysis(
  output: AnalyticsOutput,
  metrics: MetricRecord[]
): AnalysisReview {
  const byId = new Map(metrics.map((metric) => [metric.metric_id, metric]));
  const citedIds = [
    ...output.findings.flatMap((finding) => finding.metric_ids),
    ...output.proposal.metric_ids,
  ];

  const unknownIds = [...new Set(citedIds.filter((id) => !byId.has(id)))];
  if (unknownIds.length > 0) {
    return {
      ok: false,
      errors: unknownIds.map((id) => `Unknown metric_id: ${id}`),
    };
  }

  const { primary_test_variable, changed_dimensions } = output.proposal;
  const changed = new Set(changed_dimensions);
  if (changed.size !== 1 || !changed.has(primary_test_variable)) {
    return {
      ok: false,
      errors: [
        `One-variable test required: the proposal changes ${[...changed].join(", ")}, but it may change only its primary test variable, ${primary_test_variable}. Run the analysis again.`,
      ],
    };
  }

  const flags: string[] = [];

  output.findings.forEach((finding, index) => {
    const cited = finding.metric_ids.map((id) => byId.get(id)!);

    for (const metric of cited) {
      if (metric.kind === "rate" && metric.status === "not_calculable") {
        flags.push(
          `Finding ${index + 1} cites ${metric.metric_id}, which is not_calculable.`
        );
      }
    }

    for (const text of unverifiedNumbers(finding.statement, cited)) {
      flags.push(
        `Finding ${index + 1} mentions "${text}", which doesn't match its cited metrics.`
      );
    }
  });

  const allCited = [...new Set(citedIds)].map((id) => byId.get(id)!);
  for (const text of unverifiedNumbers(output.summary, allCited)) {
    flags.push(
      `Summary mentions "${text}", which doesn't match any cited metric.`
    );
  }

  const narrative = [
    output.summary,
    ...output.findings.map((finding) => finding.statement),
    output.proposal.hypothesis,
  ].join("\n");
  for (const pattern of CAUSAL_PATTERNS) {
    const match = narrative.match(pattern);
    if (match) {
      flags.push(
        `Possible causal or overconfident wording: "${match[0]}".`
      );
    }
  }

  return { ok: true, review_flags: flags };
}
