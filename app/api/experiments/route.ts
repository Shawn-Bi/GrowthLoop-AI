import type { NextRequest } from "next/server";
import { z } from "zod";
import { handleRoute, readJson } from "@/lib/controller/http";
import { listExperiments } from "@/lib/controller/overview";
import { createCycleOneExperiment } from "@/lib/controller/workflow";
import { getDb } from "@/lib/db";
import { testVariableSchema } from "@/schemas/analytics";

const bodySchema = z.object({
  hypothesis: z.string().trim().min(1).max(500),
  primary_test_variable: testVariableSchema,
});

export async function GET(request: NextRequest) {
  return handleRoute(request, async () =>
    Response.json({ experiments: await listExperiments(getDb()) })
  );
}

// Starts Cycle 1 (exp_001). The Content Agent then drafts its control and
// variant posts.
export async function POST(request: NextRequest) {
  return handleRoute(request, async () => {
    const body = await readJson(request, bodySchema);
    const experiment = await createCycleOneExperiment(getDb(), {
      hypothesis: body.hypothesis,
      primaryTestVariable: body.primary_test_variable,
    });

    return Response.json(experiment, { status: 201 });
  });
}
