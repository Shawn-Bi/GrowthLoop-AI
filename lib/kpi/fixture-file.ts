import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ControllerError } from "@/lib/controller/errors";

const DATASET_ID = /^[a-z0-9_]+$/;

// Simulated fixtures are pre-authored files in the repo (GL-03), so their
// provenance is the commit history rather than request input. Accepts a
// bare array of rows or `{ "rows": [...] }`.
export async function readFixtureRows(datasetId: string): Promise<unknown> {
  if (!DATASET_ID.test(datasetId)) {
    throw new ControllerError("dataset_id may only use a-z, 0-9 and _.", 400);
  }

  const file = path.join(process.cwd(), "data", "fixtures", `${datasetId}.json`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    throw new ControllerError(`Fixture ${datasetId} not found.`, 404);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ControllerError(`Fixture ${datasetId} is not valid JSON.`, 422);
  }

  if (typeof data === "object" && data !== null && "rows" in data) {
    return data.rows;
  }
  return data;
}
