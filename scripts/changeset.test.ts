import { describe, expect, it } from "vitest";
import { checkChangeset, isChangeset, type Package, shippedBy } from "./changeset.js";

// Shaped like a workspace with a private package nested inside a
// published one, and a private stub beside them.
const packages: Package[] = [
  { name: "core", dir: "packages/core", published: true },
  { name: "react", dir: "packages/react", published: true },
  { name: "react-compat-16", dir: "packages/react/compat/react-16", published: false },
  { name: "vue", dir: "packages/vue", published: false },
  { name: "scripts", dir: "scripts", published: false },
];

const check = (changed: string[], added: string[] = []) => checkChangeset(changed, added, packages).ok;

describe("shippedBy", () => {
  it.each([
    ["packages/core/src/store.ts", "core"],
    ["packages/core/package.json", "core"],
    ["packages/core/tsdown.config.ts", "core"],
    ["packages/react/src/field.tsx", "react"],
    ["packages/react/plugins/index.ts", "react"],
  ])("counts %s as shipped by %s", (file, name) => expect(shippedBy(file, packages)?.name).toBe(name));

  it.each([
    "packages/core/src/store.test.ts",
    "packages/react/src/field.test.tsx",
    "packages/core/src/types.test-d.ts",
    "packages/core/src/store.bench.ts",
    "packages/core/test/helpers.ts",
    "packages/react/vitest.react-16.config.ts",
    "packages/core/README.md",
    "packages/core/CHANGELOG.md",
    "packages/react/compat/react-16/src/index.ts",
    "packages/vue/src/index.ts",
    "packages/corex/src/index.ts",
    "scripts/pack.ts",
    "package.json",
  ])("counts %s as shipping nothing", (file) => expect(shippedBy(file, packages)).toBeUndefined());
});

describe("isChangeset", () => {
  it("counts a changeset", () => expect(isChangeset(".changeset/quiet-cats-dance.md")).toBe(true));
  it("skips the README", () => expect(isChangeset(".changeset/README.md")).toBe(false));
  it("skips the config", () => expect(isChangeset(".changeset/config.json")).toBe(false));
});

describe("checkChangeset", () => {
  it("passes when no package source changed", () => {
    expect(check(["README.md", "scripts/pack.ts", "packages/core/src/a.test.ts", ".github/workflows/ci.yml"])).toBe(true);
  });

  it("fails when package source changed without a changeset", () => {
    expect(check(["packages/core/src/store.ts"])).toBe(false);
  });

  it("passes when package source changed with a changeset", () => {
    const changeset = ".changeset/quiet-cats-dance.md";
    expect(check(["packages/core/src/store.ts", changeset], [changeset])).toBe(true);
  });

  it("names each changed package once", () => {
    const verdict = checkChangeset(
      ["packages/core/src/a.ts", "packages/core/src/b.ts", "packages/react/src/c.tsx"],
      [],
      packages,
    );
    expect(verdict.reasons.filter((reason) => reason.endsWith("changed (packages/core/src/a.ts)."))).toHaveLength(1);
    expect(verdict.reasons.some((reason) => reason.startsWith("react changed"))).toBe(true);
  });
});
