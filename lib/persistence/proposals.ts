import type {
  AnalysisReport,
  PrismaClient,
} from "@/generated/prisma/client";
import type { AgentRunRecord } from "@/lib/agents/analytics/run";
import {
  proposalRecordSchema,
  type ProposalRecord,
} from "@/schemas/analytics";

export function proposalFromRow(row: AnalysisReport): ProposalRecord {
  return proposalRecordSchema.parse({
    proposal_id: row.id,
    experiment_id: row.experimentId,
    analysis: row.analysis,
    status: row.status,
    errors: row.errors,
    review_flags: row.reviewFlags,
    decided_by_role: row.decidedByRole,
    decided_at: row.decidedAt?.toISOString() ?? null,
  });
}

export async function saveProposal(
  db: PrismaClient,
  proposal: ProposalRecord
): Promise<void> {
  await db.analysisReport.create({
    data: {
      id: proposal.proposal_id,
      experimentId: proposal.experiment_id,
      analysis: proposal.analysis,
      status: proposal.status,
      errors: proposal.errors,
      reviewFlags: proposal.review_flags,
      decidedByRole: proposal.decided_by_role,
      decidedAt: proposal.decided_at ? new Date(proposal.decided_at) : null,
    },
  });
}

export async function loadProposal(
  db: PrismaClient,
  proposalId: string
): Promise<ProposalRecord | null> {
  const row = await db.analysisReport.findUnique({
    where: { id: proposalId },
  });

  return row ? proposalFromRow(row) : null;
}

export async function recordAgentRun(
  db: PrismaClient,
  run: AgentRunRecord,
  experimentId: string | null
): Promise<string> {
  const row = await db.agentRun.create({
    data: {
      agent: run.agent,
      experimentId,
      model: run.model,
      status: run.status,
      attempts: run.attempts,
      inputTokens: run.input_tokens,
      outputTokens: run.output_tokens,
      latencyMs: run.latency_ms,
      stopReason: run.stop_reason,
      error: run.error,
    },
  });

  return row.id;
}
