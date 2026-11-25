import { transformAsync } from "@babel/core";
import reactCompiler from "babel-plugin-react-compiler";
import type { Plugin } from "vite";
import { packageTests } from "../../vitest.base.ts";

const base = packageTests();

/**
 * Runs the React Compiler over this package's source and tests before Vite
 * strips the types. Babel only parses TypeScript and JSX here, so the code
 * it hands on is still TypeScript. `panicThreshold: "all_errors"` turns any
 * function the Compiler gives up on into a failed transform, so a test run
 * fails instead of quietly running uncompiled code.
 */
function reactCompilerPlugin(): Plugin {
  return {
    name: "lunarhue:react-compiler",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!/\/packages\/react\/src\/.+\.tsx?$/.test(file) || /\.test-d\.tsx?$/.test(file)) return null;
      const result = await transformAsync(code, {
        filename: file,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        // Babel 8 reads `<T>(x) =>` as JSX whenever the jsx plugin is on. Like
        // TypeScript, turn JSX on only for .tsx so generic arrows in .ts parse.
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

// The type tests here use JSX, so they are .test-d.tsx as well as .test-d.ts.
// Runtime tests are .test.tsx and run in jsdom, all under StrictMode (see src/test/setup.tsx).
export default {
  ...base,
  plugins: [reactCompilerPlugin()],
  test: {
    ...base.test,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.tsx"],
    typecheck: { ...base.test?.typecheck, include: ["src/**/*.test-d.ts", "src/**/*.test-d.tsx"] },
  },
};
