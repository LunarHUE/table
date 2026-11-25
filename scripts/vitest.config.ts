import { defineProject } from "vitest/config";

// Unit tests of the CI scripts' pure parts.
export default defineProject({
  test: {
    name: "@lunarhue/table-scripts",
    include: ["*.test.ts"],
  },
});
