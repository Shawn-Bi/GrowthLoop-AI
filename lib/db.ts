import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { ControllerError } from "@/lib/controller/errors";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// One client per server process (reused across dev hot reloads). Runtime
// traffic uses Neon's pooled DATABASE_URL; migrations use the direct URL
// configured in prisma.config.ts.
export function getDb(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new ControllerError("The database is not configured (DATABASE_URL).", 503);
    }

    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg(connectionString),
    });
  }

  return globalForPrisma.prisma;
}
