import { defineConfig } from "oxlint";

// React Compiler rules, as named in eslint-plugin-react-hooks 7 `recommended-latest`.
// oxlint ports most of them natively under `react/`; the upstream plugin also runs
// through jsPlugins so the React code here follows the compiler's own implementation.
const compilerRules = [
  "rules-of-hooks",
  "exhaustive-deps",
  "static-components",
  "use-memo",
  "void-use-memo",
  "preserve-manual-memoization",
  "incompatible-library",
  "immutability",
  "globals",
  "refs",
  "set-state-in-effect",
  "error-boundaries",
  "purity",
  "set-state-in-render",
  "unsupported-syntax",
] as const;

const basePlugins = ["eslint", "typescript", "unicorn", "oxc", "import", "vitest"] as const;

export default defineConfig({
  // Setting `plugins` replaces the default set, so the defaults are listed too.
  plugins: [...basePlugins],
  categories: {
    correctness: "error",
    suspicious: "warn",
  },
  options: {
    typeAware: true,
    denyWarnings: true,
  },
  settings: {
    // Lowest React the adapter supports. Only used where the react plugin is on.
    react: { version: "16.8.0" },
  },
  rules: {
    // These check that imported names exist in the target module. oxlint's
    // resolver can't use the @lunarhue/source condition, so before a build it
    // can't see through `export * from "@lunarhue/table-core"` and reports
    // false positives. tsc already checks the same thing with the condition.
    "import/namespace": "off",
    "import/default": "off",
    "import/no-named-as-default-member": "off",
  },
  overrides: [
    {
      // The React adapter, the React end-to-end apps and the React example follow the React Compiler's rules.
      files: ["packages/react/**", "e2e/apps/react*/**", "examples/react/**"],
      // An override's `plugins` replaces the base list.
      plugins: [...basePlugins, "react"],
      // `react` is a reserved plugin name, so the upstream plugin gets an alias.
      jsPlugins: [{ name: "react-hooks-js", specifier: "eslint-plugin-react-hooks" }],
      rules: {
        ...Object.fromEntries(compilerRules.map((rule) => [`react/${rule}`, "error"])),
        ...Object.fromEntries(
          [...compilerRules, "config", "gating"].map((rule) => [`react-hooks-js/${rule}`, "error"]),
        ),
      },
    },
  ],
  ignorePatterns: ["**/dist/**", "**/coverage/**"],
});
