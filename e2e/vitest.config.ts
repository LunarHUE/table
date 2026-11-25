import { defineProject } from "vitest/config";

// Unit tests of the changed-files picker. The Playwright specs run through
// `bun run e2e`, not here.
export default defineProject({
  test: {
    name: "@lunarhue/table-e2e",
    include: ["changed/**/*.test.ts"],
  },
});
