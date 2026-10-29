import { PrismaPg } from "@prisma/adapter-pg";
import { describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

// S2: write a marker row through the pooled runtime URL, restart the app or
// redeploy, read it back, then clean up. Run `npm run db:migrate` first.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const url = process.env.DATABASE_URL;
const SMOKE_KEY = "s2-smoke";

async function withDb<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ adapter: new PrismaPg(url!) });
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

describe("S2 Postgres smoke", () => {
  it("S2 config", () => {
    console.log(`DATABASE_URL present: ${Boolean(url)}`);
    expect(url, "Set DATABASE_URL in .env.local").toBeTruthy();
  });

  it.skipIf(!url)("S2 write", async () => {
    const marker = Date.now() % 1_000_000;

    await withDb((db) =>
      db.dailyGenerationQuota.upsert({
        where: { day: SMOKE_KEY },
        create: { day: SMOKE_KEY, successfulCalls: marker },
        update: { successfulCalls: marker },
      })
    );

    console.log(
      `Wrote marker ${marker}. Restart the app or redeploy, then run npm run smoke:db:read.`
    );
  });

  it.skipIf(!url)("S2 read", async () => {
    const row = await withDb((db) =>
      db.dailyGenerationQuota.findUnique({ where: { day: SMOKE_KEY } })
    );

    expect(row, "No marker found: run npm run smoke:db:write first").not.toBeNull();
    console.log(`Read marker ${row?.successfulCalls}.`);
  });

  it.skipIf(!url)("S2 cleanup", async () => {
    await withDb((db) =>
      db.dailyGenerationQuota.deleteMany({ where: { day: SMOKE_KEY } })
    );
    console.log("Removed the S2 marker row.");
  });
});
