import type { UserConfig } from "tsdown";

// Shared JS build for every package. Each package's tsdown.config.ts is
// `export default libraryBuild()`. Declarations come from tsc, not tsdown.
//
// Output is unbundled ESM in dist/esm and CJS in dist/cjs, both with plain .js
// extensions. dist/cjs gets a package.json marking it CommonJS, so the nearest
// package.json decides the format and one set of tsc .d.ts files works in both trees.

const shared: UserConfig = {
  // Tests, benchmarks and their fixtures under src/bench and src/**/fixtures never ship.
  entry: ["src/**/*.ts", "!src/**/*.test.ts", "!src/**/*.test-d.ts", "!src/**/*.bench.ts", "!src/bench/**", "!src/**/fixtures/**"],
  root: "src",
  unbundle: true,
  target: "es2020",
  platform: "neutral",
  // The typecheck tsconfig sets the @lunarhue/source condition; builds must not.
  tsconfig: "tsconfig.build.json",
  // tsdown turns dts on when package.json has `types`; tsc writes declarations.
  dts: false,
  hash: false,
  cjsDefault: false,
  // Never inline anything from node_modules, devDependencies included.
  deps: { neverBundle: true },
  outExtensions: () => ({ js: ".js" }),
  failOnWarn: true,
};

export function libraryBuild(): UserConfig[] {
  return [
    { ...shared, format: "esm", outDir: "dist/esm" },
    {
      ...shared,
      format: "cjs",
      outDir: "dist/cjs",
      plugins: [
        {
          name: "lunarhue:cjs-package-json",
          generateBundle() {
            this.emitFile({
              type: "asset",
              fileName: "package.json",
              source: `${JSON.stringify({ type: "commonjs" })}\n`,
            });
          },
        },
      ],
    },
  ];
}

// Declarations for a package whose users don't install core: the adapters
// and bind. tsc writes them to dist/types first, then this bundles
// each entry's and inlines @lunarhue/table-core, so the package's types are
// its own. A consumer under a strict install (pnpm, Bun isolated) can't
// resolve core, and declarations tsc writes for that consumer's code must
// name only the packages it installed. The entries share one chunk of core's
// types, so a type from `.` and the same type from `./mini` are one type.
// No entry exports that chunk, so each entry must export every core type its
// functions return, or the consumer's emit fails with TS2883.
export function typesBuild(entries: readonly string[]): UserConfig[] {
  const types: UserConfig = {
    entry: Object.fromEntries(entries.map((name) => [name, `dist/types/${name}.d.ts`])),
    // Without the @lunarhue/source condition, so core resolves to its built declarations.
    tsconfig: "tsconfig.build.json",
    // The input is declarations already, so oxc only parses them.
    dts: { dtsOnly: true, generator: "oxc" },
    deps: { neverBundle: true, alwaysBundle: [/^@lunarhue\/table-core(\/|$)/] },
    outExtensions: () => ({ dts: ".d.ts" }),
    outputOptions: { entryFileNames: "[name].d.ts", chunkFileNames: "shared.d.ts" },
    hash: false,
    // The JS build already wrote these folders.
    clean: false,
    failOnWarn: true,
  };
  return [
    { ...types, format: "esm", outDir: "dist/esm" },
    { ...types, format: "esm", outDir: "dist/cjs" },
  ];
}
