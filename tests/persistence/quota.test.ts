import { beforeEach, describe, expect, it } from "vitest";
import {
  DAILY_GENERATION_LIMIT,
  QuotaExceededError,
  releaseGenerationSlot,
  reserveGenerationSlot,
} from "@/lib/persistence/quota";
import { setupTestDb, type TestDb } from "./db";

const day1 = new Date("2026-10-23T23:59:00.000Z");
const day2 = new Date("2026-10-24T00:01:00.000Z");

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(() => {
  testDb = getTestDb();
});

describe("daily generation quota", () => {
  it("allows 30 generations per UTC day and refuses the 31st with 429", async () => {
    for (let i = 1; i <= DAILY_GENERATION_LIMIT; i++) {
      expect(await reserveGenerationSlot(testDb.db, day1)).toEqual({
        day: "2026-10-23",
        used: i,
      });
    }

    const error = await reserveGenerationSlot(testDb.db, day1).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect((error as QuotaExceededError).httpStatus).toBe(429);
  });

  it("never overshoots under concurrent requests", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => reserveGenerationSlot(testDb.db, day1, 5))
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(3);
  });

  it("gives a failed generation's slot back", async () => {
    await reserveGenerationSlot(testDb.db, day1, 1);
    const slot = { day: "2026-10-23", used: 1 };

    await releaseGenerationSlot(testDb.db, slot);

    expect(await reserveGenerationSlot(testDb.db, day1, 1)).toEqual(slot);
  });

  it("starts a fresh count each UTC day", async () => {
    await reserveGenerationSlot(testDb.db, day1, 1);

    expect(await reserveGenerationSlot(testDb.db, day2, 1)).toEqual({
      day: "2026-10-24",
      used: 1,
    });
  });
});
