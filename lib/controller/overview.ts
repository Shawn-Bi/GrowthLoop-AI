import type { PrismaClient } from "@/generated/prisma/client";
import { loadHandoff } from "@/lib/persistence/experiments";
import { loadMetricRecords } from "@/lib/persistence/metrics";
import { proposalFromRow } from "@/lib/persistence/proposals";
import type { ProposalRecord } from "@/schemas/analytics";
import type { Handoff } from "@/schemas/handoff";
import type { MetricRecord } from "@/schemas/metrics";

export type ExperimentSummary = {
  id: string;
  cycle: number;
  status: string;
  parent_experiment_id: string | null;
  created_at: string;
};

export type ExperimentOverview = {
  experiment: ExperimentSummary & {
    hypothesis: string | null;
    primary_test_variable: string | null;
    child_experiment_id: string | null;
  };
  drafts: {
    content_id: string;
    variant_role: string;
    status: string;
    body: string;
    content_dna: unknown;
  }[];
  metrics: MetricRecord[];
  proposals: ProposalRecord[];
  // The approved handoff that started this experiment (cycle 2 onwards).
  handoff: Handoff | null;
};

export async function listExperiments(
  db: PrismaClient
): Promise<ExperimentSummary[]> {
  const rows = await db.experiment.findMany({
    orderBy: [{ correlationId: "asc" }, { cycle: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    cycle: row.cycle,
    status: row.status,
    parent_experiment_id: row.parentExperimentId,
    created_at: row.createdAt.toISOString(),
  }));
}

export async function loadExperimentOverview(
  db: PrismaClient,
  experimentId: string
): Promise<ExperimentOverview | null> {
  const experiment = await db.experiment.findUnique({
    where: { id: experimentId },
    include: {
      drafts: { orderBy: { id: "asc" } },
      proposals: { orderBy: { createdAt: "asc" } },
      child: { select: { id: true } },
    },
  });

  if (!experiment) {
    return null;
  }

  return {
    experiment: {
      id: experiment.id,
      cycle: experiment.cycle,
      status: experiment.status,
      parent_experiment_id: experiment.parentExperimentId,
      created_at: experiment.createdAt.toISOString(),
      hypothesis: experiment.hypothesis,
      primary_test_variable: experiment.primaryTestVariable,
      child_experiment_id: experiment.child?.id ?? null,
    },
    drafts: experiment.drafts.map((draft) => ({
      content_id: draft.id,
      variant_role: draft.variantRole,
      status: draft.status,
      body: draft.body,
      content_dna: draft.contentDna,
    })),
    metrics: await loadMetricRecords(db, experimentId),
    proposals: experiment.proposals.map(proposalFromRow),
    handoff: await loadHandoff(db, experimentId),
  };
}
