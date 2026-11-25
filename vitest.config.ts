import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One project per package, each from its own vitest.config.ts. The
    // scripts project tests the CI scripts.
    projects: ["packages/*", "scripts/vitest.config.ts"],
  },
});
