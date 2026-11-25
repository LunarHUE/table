import { transformAsync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";
import { defaultClientConditions, defineConfig, type Plugin } from "vite";

/**
 * Runs the React Compiler over this app's own source before Vite strips the
 * types. `panicThreshold: "all_errors"` fails the build when the Compiler
 * gives up on a component, instead of shipping it uncompiled.
 */
function reactCompilerPlugin(): Plugin {
  let src = "";
  return {
    name: "example:react-compiler",
    enforce: "pre",
    configResolved(config) {
      src = `${config.root}/src/`;
    },
    async transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!file.startsWith(src) || !/\.tsx?$/.test(file)) return null;
      const result = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: { plugins: file.endsWith(".tsx") ? ["typescript", "jsx"] : ["typescript"] },
        plugins: [[reactCompiler, { target: "19", panicThreshold: "all_errors" }]],
      });
      if (result?.code === null || result?.code === undefined) return null;
      if (result.map === null) return { code: result.code, map: null };
      // Babel types the map's arrays as readonly and Rolldown wants mutable ones, so copy them.
      const { names, sources, sourcesContent, ignoreList } = result.map;
      return {
        code: result.code,
        map: {
          ...result.map,
          names: [...names],
          sources: [...sources],
          sourcesContent: sourcesContent && [...sourcesContent],
          ignoreList: ignoreList && [...ignoreList],
        },
      };
    },
  };
}

export default defineConfig({
  plugins: [reactCompilerPlugin()],
  // The workspace packages export their source under this condition, so the
  // example runs the library straight from `packages/` with no build first.
  resolve: { conditions: ["@lunarhue/source", ...defaultClientConditions] },
});
