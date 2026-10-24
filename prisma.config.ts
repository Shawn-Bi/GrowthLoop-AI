import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env files itself.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on the shell environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Explicit only: `npm run db:seed` (or `npx prisma db seed`).
    seed: "tsx prisma/seed.mts",
  },
  // Migrations use Neon's direct connection; the app uses the pooled
  // DATABASE_URL through the driver adapter (lib/db.ts). Left optional so
  // `prisma generate` works without database credentials.
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED,
  },
});
