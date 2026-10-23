import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Tests run on the server side of the boundary, like route handlers.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url)
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // PGlite (in-process Postgres) starts slowly when many files run at once.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
