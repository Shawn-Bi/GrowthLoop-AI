import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, readJson } from "@/lib/controller/http";
import { decideExperimentProposal } from "@/lib/controller/workflow";
import { getDb } from "@/lib/db";
import { decisionSchema, proposalOutcomeSchema, reviewerRoleSchema } from "@/schemas/audit";

const bodySchema = z.object({
  decision: decisionSchema,
  // A recorded demo role, not a verified identity.
  reviewer_role: reviewerRoleSchema,
  // Required to approve; picks the next cycle's baseline.
  outcome: proposalOutcomeSchema.optional(),
});

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/proposals/[proposalId]/decision">
) {
  return handleRoute(request, async () => {
    const { proposalId } = await ctx.params;
    const { decision, reviewer_role, outcome } = await readJson(request, bodySchema);
    const result = await decideExperimentProposal(
      getDb(),
      proposalId,
      decision,
      reviewer_role,
      new Date(),
      outcome
    );

    return Response.json(result);
  });
}
