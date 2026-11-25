import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frameworks } from "../contract/frameworks.js";
import { type FrameworkApp, isDocs, pickFrameworks, type WorkspacePackage } from "./pick.js";
import { readWorkspace } from "./workspace.js";

// A workspace shaped like the real one, with two React majors sharing one
// app, and a pretend Vue app as a third framework, so "React and Solid
// changed" can be shown to skip Vue.
const packages: WorkspacePackage[] = [
  { name: "core", dir: "packages/core", dependsOn: [] },
  { name: "react", dir: "packages/react", dependsOn: ["core"] },
  { name: "solid", dir: "packages/solid", dependsOn: ["core"] },
  { name: "vue", dir: "packages/vue", dependsOn: ["core"] },
  { name: "scripts", dir: "scripts", dependsOn: [] },
  { name: "e2e", dir: "e2e", dependsOn: ["core"] },
  { name: "e2e-react-shared", dir: "e2e/apps/react-shared", dependsOn: ["e2e", "react"] },
  { name: "e2e-react18", dir: "e2e/apps/react18", dependsOn: ["e2e", "e2e-react-shared"] },
  { name: "e2e-react19", dir: "e2e/apps/react19", dependsOn: ["e2e", "e2e-react-shared"] },
  { name: "e2e-solid-shared", dir: "e2e/apps/solid-shared", dependsOn: ["e2e", "solid"] },
  { name: "e2e-solid2", dir: "e2e/apps/solid2", dependsOn: ["e2e", "e2e-solid-shared"] },
  { name: "e2e-vue", dir: "e2e/apps/vue", dependsOn: ["e2e", "vue"] },
];

const apps: FrameworkApp[] = [
  { framework: "react18", packageName: "e2e-react18" },
  { framework: "react19", packageName: "e2e-react19" },
  { framework: "solid2", packageName: "e2e-solid2" },
  { framework: "vue", packageName: "e2e-vue" },
];

const pick = (...changed: string[]) => pickFrameworks(changed, packages, apps).frameworks;

describe("pickFrameworks", () => {
  it.each([
    ["core", "packages/core/src/store.ts"],
    ["a spec", "e2e/specs/sorting.spec.ts"],
    ["the shared data", "e2e/contract/scenarios/sorting.ts"],
    ["the suite's config", "e2e/playwright.config.ts"],
    ["root config", "tsconfig.base.json"],
    ["the root package.json", "package.json"],
    ["the lockfile", "bun.lock"],
    ["a file in a directory that isn't a package", ".github/workflows/ci.yml"],
  ])("runs every framework when %s changes", (_, file) => {
    expect(pick(file)).toEqual(["react18", "react19", "solid2", "vue"]);
  });

  it("runs every React major, and nothing else, when only the React adapter changes", () => {
    expect(pick("packages/react/src/hooks.ts", "packages/react/src/a11y.ts")).toEqual(["react18", "react19"]);
  });

  it("runs Solid alone when only the Solid adapter changes", () => {
    expect(pick("packages/solid/src/table.ts")).toEqual(["solid2"]);
  });

  it("runs React and Solid, and skips Vue, when both of those adapters change", () => {
    expect(pick("packages/react/src/hooks.ts", "packages/solid/src/table.ts")).toEqual(["react18", "react19", "solid2"]);
  });

  it("runs every major of a framework whose shared app changed", () => {
    expect(pick("e2e/apps/react-shared/src/pages/sorting.tsx")).toEqual(["react18", "react19"]);
    expect(pick("e2e/apps/solid-shared/src/pages/sorting.tsx")).toEqual(["solid2"]);
  });

  it("runs one major alone when only its own package changed", () => {
    expect(pick("e2e/apps/react18/src/entry-client.tsx")).toEqual(["react18"]);
  });

  it("runs a third framework on its own", () => {
    expect(pick("packages/vue/src/index.ts")).toEqual(["vue"]);
  });

  it("runs nothing for docs alone, wherever they are", () => {
    expect(pick("CONTRIBUTING.md", "README.md", "packages/react/README.md", ".changeset/brave-cats.md")).toEqual([]);
  });

  it("ignores docs next to code", () => {
    expect(pick("packages/solid/README.md", "packages/solid/src/table.ts")).toEqual(["solid2"]);
  });

  it("runs nothing for a package no app depends on", () => {
    expect(pick("scripts/check-changeset.ts")).toEqual([]);
  });

  it("runs nothing when nothing changed", () => {
    expect(pickFrameworks([], packages, apps)).toEqual({ frameworks: [], reasons: ["Nothing changed."] });
  });

  it("says why it ran each framework and skipped the others", () => {
    expect(pickFrameworks(["packages/core/src/store.ts"], packages, apps).reasons).toEqual([
      "react18: core changed (packages/core/src/store.ts), and e2e-react18 depends on it through e2e.",
      "react19: core changed (packages/core/src/store.ts), and e2e-react19 depends on it through e2e.",
      "solid2: core changed (packages/core/src/store.ts), and e2e-solid2 depends on it through e2e.",
      "vue: core changed (packages/core/src/store.ts), and e2e-vue depends on it through e2e.",
    ]);
    expect(pickFrameworks(["packages/react/src/hooks.ts"], packages, apps).reasons).toEqual([
      "react18: react changed (packages/react/src/hooks.ts), and e2e-react18 depends on it through e2e-react-shared.",
      "react19: react changed (packages/react/src/hooks.ts), and e2e-react19 depends on it through e2e-react-shared.",
      "solid2: skipped, nothing e2e-solid2 depends on changed.",
      "vue: skipped, nothing e2e-vue depends on changed.",
    ]);
    expect(pickFrameworks(["bun.lock"], packages, apps).reasons).toEqual([
      "Everything: bun.lock is outside every workspace package.",
    ]);
    expect(pickFrameworks(["CONTRIBUTING.md"], packages, apps).reasons).toEqual(["Only docs changed (1 files)."]);
  });

  it("puts a file in the innermost of two nested packages", () => {
    expect(pick("e2e/apps/react19/vite.config.ts")).toEqual(["react19"]);
    expect(pick("e2e/vite.base.ts")).toEqual(["react18", "react19", "solid2", "vue"]);
  });
});

describe("isDocs", () => {
  it.each([
    "README.md",
    "packages/core/CHANGELOG.md",
    ".changeset/x.md",
    "LICENSE",
    ".github/ISSUE_TEMPLATE/bug.yml",
  ])("counts %s as docs", (file) => expect(isDocs(file)).toBe(true));

  it.each(["package.json", "packages/core/src/index.ts", "e2e/contract/styles.css", ".github/workflows/ci.yml"])(
    "counts %s as code",
    (file) => expect(isDocs(file)).toBe(false),
  );
});

describe("readWorkspace", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const workspace = readWorkspace(root);
  const named = (name: string) => workspace.find((entry) => entry.name === name);

  it("reads every app's dependencies from its package.json", () => {
    expect(named("@lunarhue/table-e2e-react-shared")?.dependsOn).toEqual(
      expect.arrayContaining(["@lunarhue/table-e2e", "@lunarhue/table-react"]),
    );
    expect(named("@lunarhue/table-e2e-solid-shared")?.dependsOn).toEqual(
      expect.arrayContaining(["@lunarhue/table-e2e", "@lunarhue/table-solid"]),
    );
  });

  it("maps a change in each real package to the majors that build on it", () => {
    // Every major's package is named after it and depends on its framework's shared app.
    const realApps: FrameworkApp[] = frameworks.map((framework) => ({
      framework: framework.name,
      packageName: `@lunarhue/table-e2e-${framework.name}`,
    }));
    const all = frameworks.map((framework) => framework.name);
    const react = all.filter((name) => name.startsWith("react"));
    const solid = all.filter((name) => name.startsWith("solid"));
    const real = (...changed: string[]) => pickFrameworks(changed, workspace, realApps).frameworks;
    expect(react).toEqual(["react16", "react17", "react18", "react19"]);
    expect(solid).toEqual(["solid2"]);
    expect(real("packages/core/src/store.ts")).toEqual(all);
    expect(real("packages/react/src/hooks.ts")).toEqual(react);
    expect(real("packages/solid/src/table.ts")).toEqual(solid);
    expect(real("e2e/apps/react-shared/src/parts.tsx")).toEqual(react);
    expect(real("e2e/apps/react17/src/entry-client.tsx")).toEqual(["react17"]);
    expect(real("scripts/check-changeset.ts")).toEqual([]);
    expect(real("packages/core/README.md")).toEqual([]);
  });
});
