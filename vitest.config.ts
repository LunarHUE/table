import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One project per package, each from its own vitest.config.ts. The Solid
    // adapter's server rendering tests compile JSX differently, so they have
    // a project of their own. The scripts project tests the CI scripts.
    projects: ["packages/*", "packages/solid/vitest.ssr.config.ts", "scripts/vitest.config.ts"],
  },
});
