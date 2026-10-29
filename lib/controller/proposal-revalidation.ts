import type { Prisma } from "@/generated/prisma/client";
import { reviewAnalysis } from "@/lib/agents/analytics/review";
import type { ProposalRecord } from "@/schemas/analytics";
import { metricRecordSchema } from "@/schemas/metrics";
import { TransitionError } from "./errors";

// A proposal is reviewed when the Analytics Agent returns it, but the stored
// row could change before a human decides. Approval re-runs the same review
// against the analysed experiment's stored metrics, so an edited proposal
// that cites unknown metric IDs or changes more than one variable can't
// advance the loop (PR #7 review).
export async function assertProposalStillValid(
  tx: Pick<Prisma.TransactionClient, "metricRecord">,
  proposal: ProposalRecord
): Promise<void> {
  const rows = await tx.metricRecord.findMany({
    where: { experimentId: proposal.experiment_id },
    orderBy: { id: "asc" },
  });
  const review = reviewAnalysis(
    proposal.analysis,
    rows.map((row) => metricRecordSchema.parse(row.record))
  );
  if (!review.ok) {
    throw new TransitionError(
      `Proposal ${proposal.proposal_id} no longer passes review, so it can't be approved: ${review.errors.join(" ")}`,
      409
    );
  }
}
