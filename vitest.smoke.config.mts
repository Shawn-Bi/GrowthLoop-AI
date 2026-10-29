import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Real-network smoke checks (S1). Kept out of `npm test`, which must stay
// free of paid API calls (S6).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["smoke/**/*.smoke.ts"],
    testTimeout: 180_000,
    // Smoke checks exist to print evidence, so show logs from passing tests.
    silent: false,
  },
});
