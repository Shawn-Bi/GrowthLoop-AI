import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, readJson } from "@/lib/controller/http";
import { ingestExperimentMetrics } from "@/lib/controller/workflow";
import { getDb } from "@/lib/db";
import { readFixtureRows } from "@/lib/kpi/fixture-file";

const bodySchema = z.object({ dataset_id: z.string().min(1) });

// Loads this experiment's rows from a simulated fixture in data/fixtures.
export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/experiments/[experimentId]/metrics">
) {
  return handleRoute(request, async () => {
    const { experimentId } = await ctx.params;
    const { dataset_id } = await readJson(request, bodySchema);
    const rows = await readFixtureRows(dataset_id);
    const result = await ingestExperimentMetrics(getDb(), experimentId, rows);

    return Response.json(result, { status: 201 });
  });
}
