import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_ATTEMPT_LIMIT,
  TooManyAttemptsError,
  hashClient,
  releaseAccessAttempt,
  reserveAccessAttempt,
} from "@/lib/persistence/access-attempts";
import { setupTestDb, type TestDb } from "./db";

// 10:05 UTC, inside the 10:00–10:15 window.
const now = new Date("2026-10-24T10:05:00.000Z");
const nextWindow = new Date("2026-10-24T10:16:00.000Z");

const getTestDb = setupTestDb();
let testDb: TestDb;

beforeEach(() => {
  testDb = getTestDb();
});

async function attempt(client: string, at = now) {
  return reserveAccessAttempt(testDb.db, client, at).catch((error: unknown) => error);
}

describe("sign-in attempt limit", () => {
  it("allows 10 attempts per window and then refuses with Retry-After", async () => {
    for (let i = 0; i < ACCESS_ATTEMPT_LIMIT; i++) {
      expect(await attempt("203.0.113.7")).not.toBeInstanceOf(Error);
    }

    const error = await attempt("203.0.113.7");
    expect(error).toBeInstanceOf(TooManyAttemptsError);
    expect((error as TooManyAttemptsError).httpStatus).toBe(429);
    // 10:05 → end of window at 10:15.
    expect((error as TooManyAttemptsError).retryAfterSeconds).toBe(600);
  });

  it("never overshoots under concurrent guesses", async () => {
    const results = await Promise.all(
      Array.from({ length: 14 }, () => attempt("203.0.113.7"))
    );

    expect(results.filter((r) => r instanceof TooManyAttemptsError)).toHaveLength(4);
  });

  it("gives an attempt back after a successful sign-in", async () => {
    for (let i = 0; i < ACCESS_ATTEMPT_LIMIT - 1; i++) {
      await attempt("203.0.113.7");
    }
    const slot = await reserveAccessAttempt(testDb.db, "203.0.113.7", now);
    await releaseAccessAttempt(testDb.db, slot);

    expect(await attempt("203.0.113.7")).not.toBeInstanceOf(Error);
  });

  it("counts each client separately", async () => {
    for (let i = 0; i < ACCESS_ATTEMPT_LIMIT; i++) {
      await attempt("203.0.113.7");
    }

    expect(await attempt("198.51.100.2")).not.toBeInstanceOf(Error);
  });

  it("starts fresh in the next window and drops old windows", async () => {
    for (let i = 0; i < ACCESS_ATTEMPT_LIMIT; i++) {
      await attempt("203.0.113.7");
    }

    expect(await attempt("203.0.113.7", nextWindow)).not.toBeInstanceOf(Error);
    expect(await testDb.db.accessAttemptWindow.count()).toBe(1);
  });

  it("stores a hash of the client address, never the address", async () => {
    await attempt("203.0.113.7");

    const [row] = await testDb.db.accessAttemptWindow.findMany();
    expect(row.clientHash).toBe(hashClient("203.0.113.7"));
    expect(row.clientHash).not.toContain("203.0.113.7");
    expect(row.clientHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
