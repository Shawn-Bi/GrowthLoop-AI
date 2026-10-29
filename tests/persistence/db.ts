import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";

const migrationsDir = new URL("../../prisma/migrations/", import.meta.url);

// Every committed migration, in order: the same SQL `prisma migrate deploy`
// applies to Neon.
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((name) =>
    readFileSync(new URL(`${name}/migration.sql`, migrationsDir), "utf8")
  );

export type TestDb = {
  db: PrismaClient;
  pg: PGlite;
  close: () => Promise<void>;
};

// A real Postgres engine (PGlite) in-process, so persistence tests run
// without Neon. Pass a data directory to persist across "restarts".
export async function createTestDb(dataDir?: string): Promise<TestDb> {
  const pg = new PGlite(dataDir);
  const migrated = await pg
    .query<{ exists: boolean }>(
      "SELECT to_regclass('public.\"Experiment\"') IS NOT NULL AS exists"
    )
    .then((result) => result.rows[0].exists);

  if (!migrated) {
    for (const sql of migrations) {
      await pg.exec(sql);
    }
  }

  return openClient(pg);
}

async function truncateAll(pg: PGlite): Promise<void> {
  const { rows } = await pg.query<{ tables: string | null }>(
    "SELECT string_agg(format('%I', tablename), ', ') AS tables FROM pg_tables WHERE schemaname = 'public'"
  );
  if (rows[0].tables) {
    await pg.exec(`TRUNCATE ${rows[0].tables} CASCADE`);
  }
}

// One migrated database per test file, emptied before each test. Starting
// PGlite once per file keeps the suite fast when files run in parallel.
export function setupTestDb(): () => TestDb {
  let testDb: TestDb | undefined;

  beforeAll(async () => {
    testDb = await createTestDb();
  });
  beforeEach(async () => {
    await truncateAll(testDb!.pg);
  });
  afterAll(async () => {
    await testDb?.close();
  });

  return () => {
    if (!testDb) {
      throw new Error("The test database is not ready.");
    }
    return testDb;
  };
}

export function openClient(pg: PGlite): TestDb {
  const db = new PrismaClient({ adapter: new PrismaPGlite(pg) });

  return {
    db,
    pg,
    close: async () => {
      await db.$disconnect();
      await pg.close();
    },
  };
}
