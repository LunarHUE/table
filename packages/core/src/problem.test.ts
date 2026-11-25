import { afterEach, expect, it, vi } from "vitest";
import { problem, type Code } from "./problem.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

const codes: readonly Code[] = [
  "feature:duplicate",
  "feature:cycle",
  "feature:missing",
  "feature:unknown",
  "column:duplicate",
  "column:unknown",
  "row:duplicate-id",
  "store:copies",
  "bind:owner",
];

it("says what went wrong in development and links to the code's entry", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(problem("column:unknown", "price")).toBe(
    '@lunarhue/table-core: No column has the id "price". https://table.lunarhue.dev/errors#core:column:unknown',
  );
  expect(problem("store:copies")).toMatch(/two copies of @lunarhue\/table-core\. Install one copy\. https:/);
});

it("names who requires a missing feature", () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(problem("feature:missing", "sorting grouping")).toContain(
    'Add sorting() to this table\'s features: feature "grouping" requires it.',
  );
  expect(problem("feature:missing", "sorting")).toContain("the table uses it");
});

it("has a sentence and a link for every code", () => {
  vi.stubEnv("NODE_ENV", "test");
  for (const code of codes) {
    const message = problem(code, "x");
    expect(message.startsWith("@lunarhue/table-core: ")).toBe(true);
    expect(message.endsWith(` https://table.lunarhue.dev/errors#core:${code}`)).toBe(true);
  }
});

it("says the code and the value in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  expect(problem("row:duplicate-id", "r1")).toBe("@lunarhue/table-core: row:duplicate-id r1");
  expect(problem("store:copies")).toBe("@lunarhue/table-core: store:copies");
});
