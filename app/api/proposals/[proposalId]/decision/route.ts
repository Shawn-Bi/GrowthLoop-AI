import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, readJson } from "@/lib/controller/http";
import { decideExperimentProposal } from "@/lib/controller/workflow";
import { getDb } from "@/lib/db";
import { decisionSchema, reviewerRoleSchema } from "@/schemas/audit";

const bodySchema = z.object({
  decision: decisionSchema,
  // A recorded demo role, not a verified identity.
  reviewer_role: reviewerRoleSchema,
});

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/proposals/[proposalId]/decision">
) {
  return handleRoute(request, async () => {
    const { proposalId } = await ctx.params;
    const { decision, reviewer_role } = await readJson(request, bodySchema);
    const result = await decideExperimentProposal(
      getDb(),
      proposalId,
      decision,
      reviewer_role,
      new Date()
    );

    return Response.json(result);
  });
}
