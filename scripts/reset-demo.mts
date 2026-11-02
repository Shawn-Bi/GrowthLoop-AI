// Removes every experiment and what hangs off it, so the one-campaign demo can
// start again from exp_001. Keeps the claim registry and the daily quota.
// Run with `npm run demo:reset -- --yes`.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local.");
}

const db = new PrismaClient({ adapter: new PrismaPg(url) });
try {
  const experiments = await db.experiment.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (experiments.length === 0) {
    console.log("No experiments to remove.");
  } else if (!process.argv.includes("--yes")) {
    console.log(
      `Would remove ${experiments.map((e) => e.id).join(", ")} and their drafts, metrics, proposals, handoffs and audit events. Re-run with --yes to do it.`
    );
  } else {
    await db.$transaction([
      db.handoff.deleteMany(),
      db.auditEvent.deleteMany(),
      db.agentRun.deleteMany(),
      db.analysisReport.deleteMany(),
      db.metricRecord.deleteMany(),
      db.contentDraft.deleteMany(),
      db.experiment.deleteMany(),
    ]);
    console.log(`Removed ${experiments.map((e) => e.id).join(", ")}. The claim registry is unchanged.`);
  }
} finally {
  await db.$disconnect();
}
