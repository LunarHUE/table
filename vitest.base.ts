import { defaultClientConditions, defaultServerConditions } from "vite";
import { defineProject, type UserWorkspaceConfig } from "vitest/config";

// Workspace packages export their src entry under this condition, so tests
// import sibling packages from source without building them first.
const sourceCondition = "@lunarhue/source";

/** Settings a package passes to `packageTests`. */
export interface PackageTestOptions {
  /**
   * Extra conditions to resolve with, ahead of the defaults, for imported
   * source and for dependencies loaded by Node. Solid needs `browser`, since
   * its node build is the server one, where signal writes do nothing.
   */
  readonly conditions?: readonly string[];
}

// Shared test project for every package. Each package's vitest.config.ts is
// `export default packageTests()`. Benchmarks are `src/**/*.bench.ts`, which
// `vitest bench` finds by its default pattern and `vitest run` leaves out.
export function packageTests(options: PackageTestOptions = {}): UserWorkspaceConfig {
  const extra = options.conditions ?? [];
  return defineProject({
    resolve: { conditions: [sourceCondition, ...extra, ...defaultClientConditions] },
    ssr: {
      resolve: {
        conditions: [sourceCondition, ...extra, ...defaultServerConditions],
        ...(extra.length > 0 ? { externalConditions: [...extra] } : {}),
      },
    },
    test: {
      include: ["src/**/*.test.ts"],
      typecheck: {
        enabled: true,
        include: ["src/**/*.test-d.ts"],
        tsconfig: "./tsconfig.json",
      },
    },
  });
}
