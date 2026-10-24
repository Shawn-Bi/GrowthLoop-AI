// Loads data/seed/claims.json (GL-02) into the Claim table.
// Run with `npm run db:seed`, or pass another file: `npm run db:seed -- path/to/claims.json`.
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { seedClaimRegistry } from "@/lib/persistence/claims";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const file = process.argv[2] ?? "data/seed/claims.json";
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local.");
}

const db = new PrismaClient({ adapter: new PrismaPg(url) });
try {
  const registry: unknown = JSON.parse(await readFile(file, "utf8"));
  const result = await seedClaimRegistry(db, registry);
  console.log(
    `Seeded claim registry ${result.registry_version} from ${file}: ${result.upserted} claims` +
      (result.removed.length > 0 ? `, removed ${result.removed.join(", ")}` : "")
  );
} finally {
  await db.$disconnect();
}
