import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, readJson } from "@/lib/controller/http";
import { getDb } from "@/lib/db";
import { decideDraft } from "@/lib/persistence/drafts";
import { reviewerRoleSchema } from "@/schemas/audit";
import { draftActionSchema } from "@/schemas/drafts";

const bodySchema = z.object({
  // approve | reject | mark_ready (approved → ready_for_manual_publication)
  action: draftActionSchema,
  // A recorded demo role, not a verified identity.
  reviewer_role: reviewerRoleSchema,
});

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/drafts/[draftId]/decision">
) {
  return handleRoute(request, async () => {
    const { draftId } = await ctx.params;
    const { action, reviewer_role } = await readJson(request, bodySchema);
    const result = await decideDraft(getDb(), {
      draftId,
      action,
      reviewerRole: reviewer_role,
      now: new Date(),
    });

    return Response.json(result);
  });
}
