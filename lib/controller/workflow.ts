import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { AnalyticsInput } from "@/lib/agents/analytics/prompt";
import { toProposalRecord } from "@/lib/agents/analytics/proposal";
import type { AnalyticsRunResult } from "@/lib/agents/analytics/run";
import { buildMetricRecords } from "@/lib/kpi/calculate";
import { ingestFixture, type QuarantinedRow } from "@/lib/kpi/ingest";
import { loadUsableClaimIds } from "@/lib/persistence/claims";
import {
  createRootExperiment,
  decideProposalAndAdvance,
  type DecisionResult,
} from "@/lib/persistence/experiments";
import {
  loadMetricRecords,
  saveMetricRecords,
} from "@/lib/persistence/metrics";
import {
  loadProposal,
  recordAgentRun,
  saveProposal,
} from "@/lib/persistence/proposals";
import {
  releaseGenerationSlot,
  reserveGenerationSlot,
} from "@/lib/persistence/quota";
import type { ProposalRecord, TestVariable } from "@/schemas/analytics";
import type { Decision, ReviewerRole } from "@/schemas/audit";
import { ControllerError, TransitionError } from "./errors";
import { nextSequentialId } from "./ids";

// Only drafts a human approved for (manual) publication can have outcomes.
const PUBLISHED_DRAFT_STATUSES = [
  "approved" as const,
  "ready_for_manual_publication" as const,
];

async function requireOpenExperiment(db: PrismaClient, experimentId: string) {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment) {
    throw new TransitionError(`Experiment ${experimentId} not found.`, 404);
  }
  if (experiment.status !== "open") {
    throw new TransitionError(`Experiment ${experimentId} is closed.`, 409);
  }

  return experiment;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : { value };
}

export type MetricsIngestionResult = {
  saved: number;
  metric_ids: string[];
  quarantined: QuarantinedRow[];
  // Valid-looking rows that belong to other experiments in the same file.
  ignored_rows: number;
};

// Loads one experiment's rows from a simulated fixture, stores its KPIs and
// reports quarantined rows with reasons (GL-08 through the controller).
export async function ingestExperimentMetrics(
  db: PrismaClient,
  experimentId: string,
  rows: unknown
): Promise<MetricsIngestionResult> {
  if (!Array.isArray(rows)) {
    throw new ControllerError("Fixture must be an array of rows.", 400);
  }

  await requireOpenExperiment(db, experimentId);

  const indices: number[] = [];
  rows.forEach((row, index) => {
    const rowExperiment = asRecord(row).experiment_id;
    if (typeof rowExperiment !== "string" || rowExperiment === experimentId) {
      indices.push(index);
    }
  });

  const drafts = await db.contentDraft.findMany({
    where: { experimentId, status: { in: PUBLISHED_DRAFT_STATUSES } },
    select: { id: true, variantRole: true },
  });
  const { accepted, quarantined } = ingestFixture(
    indices.map((index) => rows[index]),
    drafts.map((draft) => ({
      experiment_id: experimentId,
      variant_role: draft.variantRole,
      content_id: draft.id,
    }))
  );

  const existing = await db.metricRecord.findFirst({
    where: { experimentId },
    select: { datasetId: true },
  });
  const otherDataset = accepted.find(
    (row) => existing && row.dataset_id !== existing.datasetId
  );
  if (existing && otherDataset) {
    throw new TransitionError(
      `Metrics from dataset ${existing.datasetId} are already loaded for ${experimentId}.`,
      409
    );
  }

  const records = buildMetricRecords(accepted);
  const saved = await saveMetricRecords(db, records);

  return {
    saved,
    metric_ids: records.map((record) => record.metric_id),
    quarantined: quarantined.map((row) => ({
      ...row,
      index: indices[row.index],
    })),
    ignored_rows: rows.length - indices.length,
  };
}

export type AnalyticsAgentRunner = (
  input: AnalyticsInput
) => Promise<AnalyticsRunResult>;

// Runs the Analytics Agent on stored metrics and queues its proposal for the
// experiment approver. Each call takes one daily generation slot, given back
// if the call fails.
export async function runExperimentAnalysis(
  db: PrismaClient,
  runAgent: AnalyticsAgentRunner,
  experimentId: string,
  now: Date
): Promise<ProposalRecord> {
  await requireOpenExperiment(db, experimentId);

  const pending = await db.analysisReport.findFirst({
    where: { experimentId, status: "needs_human_approval" },
    select: { id: true },
  });
  if (pending) {
    throw new TransitionError(
      `Proposal ${pending.id} is still awaiting approval.`,
      409
    );
  }

  const metrics = await loadMetricRecords(db, experimentId);
  if (metrics.length === 0) {
    throw new TransitionError(
      `Load simulated metrics for ${experimentId} before running analysis.`,
      409
    );
  }

  const drafts = await db.contentDraft.findMany({
    where: { id: { in: [...new Set(metrics.map((m) => m.content_id))] } },
    orderBy: { id: "asc" },
  });

  if (drafts.length !== 2 || new Set(drafts.map((draft) => draft.variantRole)).size !== 2 ||
      drafts.some((draft) => !PUBLISHED_DRAFT_STATUSES.includes(draft.status as "approved" | "ready_for_manual_publication"))) {
    throw new TransitionError("Analysis requires two human-approved experiment drafts.", 409);
  }
  const slot = await reserveGenerationSlot(db, now);
  let result: AnalyticsRunResult;
  try {
    result = await runAgent({
      experiment_id: experimentId,
      metrics,
      drafts: drafts.map((draft) => ({
        content_id: draft.id,
        variant_role: draft.variantRole,
        content_dna: asRecord(draft.contentDna),
      })),
    });
  } catch (error) {
    await releaseGenerationSlot(db, slot);
    throw error;
  }

  await recordAgentRun(db, result.run, experimentId);

  if (!result.ok) {
    await releaseGenerationSlot(db, slot);
    throw new ControllerError(result.error, 502);
  }

  const count = await db.analysisReport.count({ where: { experimentId } });
  const proposal = toProposalRecord(
    `prop_${experimentId}_${count + 1}`,
    experimentId,
    result.output,
    metrics
  );
  await saveProposal(db, proposal);

  return proposal;
}

// Approving starts the next cycle: the experiment ID follows the parent's,
// and the Content Agent may use only approved or verified claims.
export async function decideExperimentProposal(
  db: PrismaClient,
  proposalId: string,
  decision: Decision,
  reviewerRole: ReviewerRole,
  now: Date
): Promise<DecisionResult> {
  const proposal = await loadProposal(db, proposalId);
  if (!proposal) {
    throw new TransitionError(`Proposal ${proposalId} not found.`, 404);
  }

  let next: { experimentId: string; taskId: string; approvedClaimIds: string[] } | undefined;
  if (decision === "approved") {
    const experimentId = nextSequentialId(proposal.experiment_id);
    const baselineId = proposal.analysis.proposal.content_change?.baseline_content_id;
    const baseline = baselineId ? await db.contentDraft.findUnique({ where: { id: baselineId } }) : null;
    const usable = await loadUsableClaimIds(db);
    next = {
      experimentId,
      taskId: `task_${experimentId}`,
      approvedClaimIds: baseline ? baseline.claimIdsUsed.filter((id) => usable.includes(id)) : usable,
    };
  }

  return decideProposalAndAdvance(db, {
    proposalId,
    decision,
    reviewerRole,
    now,
    next,
  });
}

// The MVP runs one campaign (PRD §2), so Cycle 1 is always exp_001. Later
// cycles take their IDs from their parent (exp_001 → exp_002), which a
// second root experiment would collide with.
export const CYCLE_ONE_EXPERIMENT_ID = "exp_001";

export async function createCycleOneExperiment(
  db: PrismaClient,
  input: { hypothesis: string; primaryTestVariable: TestVariable }
): Promise<{ experiment_id: string; correlation_id: string }> {
  const experimentId = CYCLE_ONE_EXPERIMENT_ID;
  const correlationId = `corr_${experimentId}`;

  try {
    await createRootExperiment(db, {
      id: experimentId,
      correlationId,
      hypothesis: input.hypothesis,
      primaryTestVariable: input.primaryTestVariable,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TransitionError(`${experimentId} already exists.`, 409);
    }
    throw error;
  }

  return { experiment_id: experimentId, correlation_id: correlationId };
}
