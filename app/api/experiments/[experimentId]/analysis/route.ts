import type { NextRequest } from "next/server";
import { runAnalyticsAgent } from "@/lib/agents/analytics/run";
import { getAnthropicClient, getAnthropicModel } from "@/lib/anthropic";
import { handleRoute } from "@/lib/controller/http";
import { runExperimentAnalysis } from "@/lib/controller/workflow";
import { getDb } from "@/lib/db";

// One agent call with up to one schema repair; leaves headroom for the SDK
// timeout.
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/experiments/[experimentId]/analysis">
) {
  return handleRoute(request, async () => {
    const { experimentId } = await ctx.params;
    const client = getAnthropicClient();
    const model = getAnthropicModel();

    const proposal = await runExperimentAnalysis(
      getDb(),
      (input) => runAnalyticsAgent(client, model, input),
      experimentId,
      new Date()
    );

    return Response.json(proposal, { status: 201 });
  });
}
