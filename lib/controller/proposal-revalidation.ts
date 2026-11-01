import type { Prisma } from "@/generated/prisma/client";
import { reviewAnalysis } from "@/lib/agents/analytics/review";
import type { ProposalRecord } from "@/schemas/analytics";
import { metricRecordSchema } from "@/schemas/metrics";
import { TransitionError } from "./errors";

// A proposal is reviewed when the Analytics Agent returns it, but the stored
// row or its metrics could change before a human decides. Approval re-runs
// the same review against the analysed experiment's stored metrics (PR #7
// review). An edited proposal that cites unknown metric IDs or changes more
// than one variable can't advance. Neither can one with a concern the
// approver wasn't shown, or metrics whose stored record disagrees with the
// row it's filed under.
export async function assertProposalStillValid(
  tx: Pick<Prisma.TransactionClient, "metricRecord">,
  proposal: ProposalRecord
): Promise<void> {
  const rows = await tx.metricRecord.findMany({
    where: { experimentId: proposal.experiment_id },
    orderBy: { id: "asc" },
  });
  const metrics = rows.map((row) => {
    const record = metricRecordSchema.parse(row.record);
    if (
      record.metric_id !== row.id ||
      record.experiment_id !== row.experimentId ||
      record.content_id !== row.contentId ||
      record.dataset_id !== row.datasetId ||
      record.variant_role !== row.variantRole ||
      record.metric !== row.metric
    ) {
      throw new TransitionError(
        `Proposal ${proposal.proposal_id} can't be approved: metric ${row.id} doesn't match its stored association.`,
        409
      );
    }
    return record;
  });
  const review = reviewAnalysis(proposal.analysis, metrics);
  if (!review.ok) {
    throw new TransitionError(
      `Proposal ${proposal.proposal_id} no longer passes review, so it can't be approved: ${review.errors.join(" ")}`,
      409
    );
  }

  const unseen = review.review_flags.filter((flag) => !proposal.review_flags.includes(flag));
  if (unseen.length > 0) {
    throw new TransitionError(
      `Proposal ${proposal.proposal_id} changed after review, so it can't be approved: ${unseen.join(" ")} Run the analysis again.`,
      409
    );
  }
}
