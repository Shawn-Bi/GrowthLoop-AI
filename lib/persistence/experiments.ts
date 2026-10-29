import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { generateContentInTransaction } from "@/lib/controller/content-generation";
import { buildNextCycleHandoff } from "@/lib/controller/build-handoff";
import {
  assertCanStartNextCycle,
  assertOutcomeAllowed,
  chooseBaseline,
  primaryKpiCalculable,
} from "@/lib/controller/cycle-rules";
import { TransitionError } from "@/lib/controller/errors";
import { decideProposal } from "@/lib/controller/proposal-approval";
import type { ProposalRecord, TestVariable } from "@/schemas/analytics";
import type { AuditEvent, Decision, ProposalOutcome, ReviewerRole } from "@/schemas/audit";
import { handoffSchema, type Handoff } from "@/schemas/handoff";
import { loadMetricRecords } from "./metrics";
import { proposalFromRow } from "./proposals";

export async function createRootExperiment(
  db: PrismaClient,
  experiment: {
    id: string;
    correlationId: string;
    hypothesis: string;
    primaryTestVariable: TestVariable;
  }
): Promise<void> {
  await db.experiment.create({ data: { ...experiment, cycle: 1 } });
}

export type DecisionInput = {
  proposalId: string;
  decision: Decision;
  reviewerRole: ReviewerRole;
  now: Date;
  // Required to approve: the approver's reading of the result.
  outcome?: ProposalOutcome;
  // Required to approve: controller-assigned IDs for the next cycle and the
  // claim IDs the Content Agent may use.
  next?: {
    experimentId: string;
    taskId: string;
    approvedClaimIds: string[];
  };
};

export type DecisionResult = {
  proposal: ProposalRecord;
  audit: AuditEvent;
  handoff: Handoff | null;
};

// Records a human decision on a proposal. Approval atomically closes the
// analysed experiment, creates the next one with its parent link, and
// stores the handoff that becomes the next cycle's Experiment Memory
// (PRD §3 step 8). Any failure rolls the whole decision back.
export async function decideProposalAndAdvance(
  db: PrismaClient,
  input: DecisionInput
): Promise<DecisionResult> {
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.analysisReport.findUnique({
        where: { id: input.proposalId },
      });
      if (!row) {
        throw new TransitionError(`Proposal ${input.proposalId} not found.`, 404);
      }

      const { proposal, audit } = decideProposal(
        proposalFromRow(row),
        input.decision,
        input.reviewerRole,
        input.now,
        input.outcome
      );

      if (proposal.status === "approved" && !input.next) {
        throw new Error("Approving a proposal requires the next cycle's IDs.");
      }

      const parent = await tx.experiment.findUniqueOrThrow({
        where: { id: proposal.experiment_id },
        include: {
          drafts: { select: { id: true, variantRole: true }, orderBy: { id: "asc" } },
        },
      });
      let baselineContentId: string | undefined;
      if (proposal.status === "approved" && proposal.outcome) {
        assertCanStartNextCycle(parent.id, parent.cycle);
        assertOutcomeAllowed(
          proposal.outcome,
          primaryKpiCalculable(await loadMetricRecords(tx, parent.id))
        );
        baselineContentId = chooseBaseline(proposal.outcome, parent.drafts);
      }

      // Conditional update: a concurrent decision leaves nothing to match.
      const updated = await tx.analysisReport.updateMany({
        where: { id: proposal.proposal_id, status: "needs_human_approval" },
        data: {
          status: proposal.status,
          decidedByRole: input.reviewerRole,
          decidedAt: input.now,
          outcome: proposal.outcome,
        },
      });
      if (updated.count !== 1) {
        throw new TransitionError(
          `Proposal ${proposal.proposal_id} was already decided.`,
          409
        );
      }

      await tx.auditEvent.create({
        data: {
          eventType: audit.event_type,
          recordType: audit.record_type,
          recordId: audit.record_id,
          decision: audit.decision,
          reviewerRole: audit.reviewer_role,
          fromStatus: audit.from_status,
          toStatus: audit.to_status,
          outcome: audit.outcome,
          occurredAt: new Date(audit.occurred_at),
        },
      });

      if (proposal.status !== "approved" || !input.next) {
        return { proposal, audit, handoff: null };
      }

      const handoff = buildNextCycleHandoff({
        proposal,
        sourceContentIds: parent.drafts.map((draft) => draft.id),
        approvedClaimIds: input.next.approvedClaimIds,
        baselineContentId,
        nextExperimentId: input.next.experimentId,
        taskId: input.next.taskId,
        correlationId: parent.correlationId,
      });

      await tx.experiment.update({
        where: { id: parent.id },
        data: { status: "closed" },
      });
      await tx.experiment.create({
        data: {
          id: handoff.experiment_id,
          correlationId: parent.correlationId,
          cycle: parent.cycle + 1,
          parentExperimentId: parent.id,
          hypothesis: handoff.hypothesis,
          primaryTestVariable: handoff.primary_test_variable,
        },
      });
      await tx.handoff.create({
        data: {
          idempotencyKey: handoff.idempotency_key,
          experimentId: handoff.experiment_id,
          parentExperimentId: parent.id,
          proposalId: proposal.proposal_id,
          payload: handoff,
        },
      });

      // Integrated drafts carry a validated brief; generate the child pair in this same transaction.
      const source = await tx.contentDraft.findFirst({ where: { experimentId: parent.id } });
      if (source && typeof source.contentDna === "object" && source.contentDna !== null && "schema_version" in source.contentDna) {
        await generateContentInTransaction(tx, handoff.experiment_id);
      }
      return { proposal, audit, handoff };
    });
  } catch (error) {
    // Unique constraints back up the 409 above: the parent already has a
    // child, or this proposal already produced a handoff.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new TransitionError(
        "The next experiment or its handoff already exists.",
        409
      );
    }
    throw error;
  }
}

// The handoff that started an experiment, read back from PostgreSQL so a
// cycle can continue after a restart or redeploy.
export async function loadHandoff(
  db: PrismaClient,
  experimentId: string
): Promise<Handoff | null> {
  const row = await db.handoff.findUnique({ where: { experimentId } });
  return row ? handoffSchema.parse(row.payload) : null;
}

export type ExperimentTraceEntry = {
  experiment_id: string;
  cycle: number;
  parent_experiment_id: string | null;
  status: string;
  content_ids: string[];
  metric_ids: string[];
  proposals: { proposal_id: string; status: string }[];
};

const MAX_TRACE_LENGTH = 100;

// exp_001 → cnt_001/cnt_002 → metrics → exp_002 → … (PRD P0 #8).
export async function loadExperimentTrace(
  db: PrismaClient,
  rootExperimentId: string
): Promise<ExperimentTraceEntry[]> {
  const trace: ExperimentTraceEntry[] = [];
  let id: string | null = rootExperimentId;

  while (id && trace.length < MAX_TRACE_LENGTH) {
    const experiment: Prisma.ExperimentGetPayload<{
      include: {
        drafts: { select: { id: true } };
        metrics: { select: { id: true } };
        proposals: { select: { id: true; status: true } };
        child: { select: { id: true } };
      };
    }> | null = await db.experiment.findUnique({
      where: { id },
      include: {
        drafts: { select: { id: true }, orderBy: { id: "asc" } },
        metrics: { select: { id: true }, orderBy: { id: "asc" } },
        proposals: {
          select: { id: true, status: true },
          orderBy: { createdAt: "asc" },
        },
        child: { select: { id: true } },
      },
    });

    if (!experiment) {
      break;
    }

    trace.push({
      experiment_id: experiment.id,
      cycle: experiment.cycle,
      parent_experiment_id: experiment.parentExperimentId,
      status: experiment.status,
      content_ids: experiment.drafts.map((draft) => draft.id),
      metric_ids: experiment.metrics.map((metric) => metric.id),
      proposals: experiment.proposals.map((proposal) => ({
        proposal_id: proposal.id,
        status: proposal.status,
      })),
    });
    id = experiment.child?.id ?? null;
  }

  return trace;
}
