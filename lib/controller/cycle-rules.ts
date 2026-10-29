import type { ProposalOutcome } from "@/schemas/audit";
import type { MetricRecord } from "@/schemas/metrics";
import { TransitionError } from "./errors";

// How many cycles one experiment chain may run. The PRD demo stops after
// Cycle 2; set MAX_EXPERIMENT_CYCLES to change it. The Content Agent's
// revision limit (3) is separate.
export const DEFAULT_MAX_EXPERIMENT_CYCLES = 2;

export function maxExperimentCycles(): number {
  const raw = process.env.MAX_EXPERIMENT_CYCLES?.trim();
  if (!raw) {
    return DEFAULT_MAX_EXPERIMENT_CYCLES;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("MAX_EXPERIMENT_CYCLES must be a positive whole number.");
  }
  return value;
}

export function assertCanStartNextCycle(experimentId: string, cycle: number): void {
  const max = maxExperimentCycles();
  if (cycle >= max) {
    throw new TransitionError(
      `${experimentId} is cycle ${cycle} of ${max}, so the loop stops here. Reject the proposal, or raise MAX_EXPERIMENT_CYCLES to continue.`,
      409
    );
  }
}

type Draft = { id: string; variantRole: string };

// PR #13 decision 3: the human-approved winner becomes the baseline. Only
// "variant_better" moves it to the variant; "control_better" and
// "inconclusive" keep the control, which is the previous baseline.
export function chooseBaseline(outcome: ProposalOutcome, drafts: Draft[]): string {
  const role = outcome === "variant_better" ? "variant" : "control";
  const matches = drafts.filter((draft) => draft.variantRole === role);
  if (matches.length !== 1) {
    throw new TransitionError(`Expected exactly one ${role} draft to use as the baseline.`, 409);
  }
  return matches[0].id;
}

// Both arms need a calculated primary KPI before anyone can call a winner.
export function primaryKpiCalculable(metrics: MetricRecord[]): boolean {
  return (["control", "variant"] as const).every((role) =>
    metrics.some(
      (metric) =>
        metric.kind === "rate" &&
        metric.metric === "qualified_demo_rate_per_visit" &&
        metric.variant_role === role &&
        metric.status === "calculated"
    )
  );
}

export function assertOutcomeAllowed(outcome: ProposalOutcome, calculable: boolean): void {
  if (!calculable && outcome !== "inconclusive") {
    throw new TransitionError(
      "The primary KPI isn't calculable for both variants, so the result can only be recorded as inconclusive.",
      409
    );
  }
}
