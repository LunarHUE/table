import { isAbsolute, join } from "node:path";
import { defaultClientConditions, defaultServerConditions, type Plugin, type PluginOption, type UserConfig } from "vite";

// Workspace packages export their source under this condition, so the apps
// build the library from source and need no package build first.
const sourceCondition = "@lunarhue/source";

/** Imports of the module itself or any subpath of it, such as `react` and `react-dom/server`. */
const importsOf = (name: string) => (source: string) => source === name || source.startsWith(`${name}/`);

/**
 * Resolves the framework's own modules, subpaths included, from the app
 * being built instead of from the importing file. The pages live in the
 * shared package (`apps/react-shared` or `apps/solid-shared`) and the adapter in
 * `packages/`, and both would find the workspace's newest version. Each
 * major's package installs its own, so this makes the pages, the adapter
 * and the framework's renderer all use that one copy, on the client and in
 * the server bundle.
 *
 * `replace` sends an import to another module, resolved the same way, or to
 * a file given by its absolute path. React 16.8, which has no JSX runtime,
 * needs a file.
 */
export function pinFramework(names: readonly string[], replace: Readonly<Record<string, string>> = {}): Plugin {
  const matchers = names.map(importsOf);
  let manifest = "";
  return {
    name: "lunarhue:pin-framework",
    enforce: "pre",
    // The server build bundles the framework too. Left external, Node would
    // import React 16's CommonJS by name and find no named exports.
    config: () => ({ ssr: { noExternal: [...names] } }),
    configResolved(config) {
      manifest = join(config.root, "package.json");
    },
    resolveId(source, _importer, options) {
      const target = replace[source] ?? source;
      if (isAbsolute(target)) return target;
      if (target === source && !matchers.some((matches) => matches(source))) return null;
      return this.resolve(target, manifest, { ...options, skipSelf: true });
    },
  };
}

/** Files Solid's plugin must leave alone: the dependencies. */
export const notSolid = [/\/node_modules\//];

/**
 * The Vite config every app shares. `vite build` makes the client bundle,
 * with its entry at a fixed name the shared server links to, and
 * `vite build --ssr src/entry-server.tsx` makes the server entry the shared
 * server imports. Only the framework's plugins differ.
 */
export function appConfig(plugins: PluginOption[], ssrBuild: boolean): UserConfig {
  return {
    plugins,
    resolve: { conditions: [sourceCondition, ...defaultClientConditions] },
    ssr: { resolve: { conditions: [sourceCondition, ...defaultServerConditions] } },
    build: ssrBuild
      ? { outDir: "dist/server", emptyOutDir: true }
      : {
          outDir: "dist/client",
          emptyOutDir: true,
          rolldownOptions: {
            input: "src/entry-client.tsx",
            output: { entryFileNames: "assets/client.js" },
          },
        },
  };
}

/**
 * `config` with `condition` resolved ahead of the others, on the client and
 * in the server build.
 */
export function withCondition(config: UserConfig, condition: string): UserConfig {
  return {
    ...config,
    resolve: { ...config.resolve, conditions: [condition, ...(config.resolve?.conditions ?? [])] },
    ssr: { ...config.ssr, resolve: { ...config.ssr?.resolve, conditions: [condition, ...(config.ssr?.resolve?.conditions ?? [])] } },
  };
}
