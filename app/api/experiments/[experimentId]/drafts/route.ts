import type { NextRequest } from "next/server";
import { runContentAgent } from "@/lib/agents/content/run";
import { getAnthropicClient, getAnthropicModel } from "@/lib/anthropic";
import { handleRoute } from "@/lib/controller/http";
import { ControllerError } from "@/lib/controller/errors";
import { generateExperimentContent } from "@/lib/controller/content-generation";
import { getDb } from "@/lib/db";

// One agent call with up to one repair; leaves headroom for the SDK timeout.
export const maxDuration = 120;

export async function POST(request: NextRequest, ctx: RouteContext<"/api/experiments/[experimentId]/drafts">) {
  return handleRoute(request, async () => {
    const { experimentId } = await ctx.params;
    const text = await request.text();
    let input: unknown;
    try { input = text.trim() ? JSON.parse(text) : undefined; }
    catch { throw new ControllerError("Invalid JSON.", 400); }
    const client = getAnthropicClient();
    const model = getAnthropicModel();
    const result = await generateExperimentContent(getDb(), experimentId, input,
      (agentInput) => runContentAgent(client, model, agentInput), new Date());
    return Response.json(result, { status: 201 });
  });
}
