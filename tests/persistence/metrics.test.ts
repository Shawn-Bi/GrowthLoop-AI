import { beforeEach, describe, expect, it } from "vitest";
import { createRootExperiment } from "@/lib/persistence/experiments";
import { loadMetricRecords, saveMetricRecords } from "@/lib/persistence/metrics";
import { recordAgentRun } from "@/lib/persistence/proposals";
import { metrics } from "../analytics/fixtures";
import { setupTestDb, type TestDb } from "./db";

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(async () => {
  testDb = getTestDb();
  await createRootExperiment(testDb.db, {
    id: "exp_001",
    correlationId: "corr_001",
    hypothesis: "h",
    primaryTestVariable: "hook",
  });
});

describe("metric records", () => {
  it("round-trips the full metric contract", async () => {
    expect(await saveMetricRecords(testDb.db, metrics)).toBe(metrics.length);

    const loaded = await loadMetricRecords(testDb.db, "exp_001");

    expect(loaded).toHaveLength(metrics.length);
    expect(loaded).toEqual(
      [...metrics].sort((a, b) => a.metric_id.localeCompare(b.metric_id))
    );
  });

  it("keeps existing rows when the same dataset is saved again", async () => {
    await saveMetricRecords(testDb.db, metrics);

    expect(await saveMetricRecords(testDb.db, metrics)).toBe(0);
    expect(await testDb.db.metricRecord.count()).toBe(metrics.length);
  });

  it("only loads metrics for the requested experiment", async () => {
    await saveMetricRecords(testDb.db, metrics);

    expect(await loadMetricRecords(testDb.db, "exp_999")).toEqual([]);
  });
});

describe("agent runs", () => {
  it("stores token usage and latency without prompt content", async () => {
    const id = await recordAgentRun(
      testDb.db,
      {
        agent: "analytics",
        model: "test-model",
        status: "completed",
        attempts: 2,
        input_tokens: 200,
        output_tokens: 100,
        latency_ms: 3000,
        stop_reason: "end_turn",
        error: null,
      },
      "exp_001"
    );

    expect(await testDb.db.agentRun.findUniqueOrThrow({ where: { id } })).toMatchObject({
      experimentId: "exp_001",
      status: "completed",
      inputTokens: 200,
      outputTokens: 100,
      latencyMs: 3000,
    });
  });
});
