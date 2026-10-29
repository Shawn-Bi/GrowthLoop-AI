import type { NextRequest } from "next/server";
import { TransitionError } from "@/lib/controller/errors";
import { handleRoute } from "@/lib/controller/http";
import { getDb } from "@/lib/db";
import { loadExperimentTrace } from "@/lib/persistence/experiments";

// exp_001 → drafts → metrics → proposals → exp_002 … (PRD P0 #8).
export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/experiments/[experimentId]/trace">
) {
  return handleRoute(request, async () => {
    const { experimentId } = await ctx.params;
    const trace = await loadExperimentTrace(getDb(), experimentId);

    if (trace.length === 0) {
      throw new TransitionError(`Experiment ${experimentId} not found.`, 404);
    }
    return Response.json({ trace });
  });
}
