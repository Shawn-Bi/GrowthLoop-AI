import type { NextRequest } from "next/server";
import { handleRoute } from "@/lib/controller/http";
import { ControllerError } from "@/lib/controller/errors";
import { generateExperimentContent } from "@/lib/controller/content-generation";
import { getDb } from "@/lib/db";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/experiments/[experimentId]/drafts">) {
  return handleRoute(request, async () => {
    const { experimentId } = await ctx.params;
    const text = await request.text();
    let input: unknown;
    try { input = text.trim() ? JSON.parse(text) : undefined; }
    catch { throw new ControllerError("Invalid JSON.", 400); }
    return Response.json(await generateExperimentContent(getDb(), experimentId, input), { status: 201 });
  });
}
