import type { NextRequest } from "next/server";
import { TransitionError } from "@/lib/controller/errors";
import { handleRoute } from "@/lib/controller/http";
import { loadExperimentOverview } from "@/lib/controller/overview";
import { getDb } from "@/lib/db";

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/experiments/[experimentId]">
) {
  return handleRoute(request, async () => {
    const { experimentId } = await ctx.params;
    const overview = await loadExperimentOverview(getDb(), experimentId);

    if (!overview) {
      throw new TransitionError(`Experiment ${experimentId} not found.`, 404);
    }
    return Response.json(overview);
  });
}
