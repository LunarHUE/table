import solid from "@solidjs/vite-plugin";
import { packageTests } from "../../vitest.base.ts";

// Solid's browser build. Vite turns the second condition into `development`,
// or `production` when NODE_ENV is production.
const config = packageTests({ conditions: ["browser", "development|production"] });

// Runtime tests render into jsdom. The Solid plugin compiles their JSX with
// Solid's compiler, and also parses the JSX in the .test-d.tsx type tests.
// Server rendering tests compile JSX differently, so they run in
// vitest.ssr.config.ts.
export default {
  ...config,
  plugins: [solid()],
  test: {
    ...config.test,
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/**/*.ssr.test.tsx"],
    typecheck: { ...config.test?.typecheck, include: ["src/**/*.test-d.ts", "src/**/*.test-d.tsx"] },
  },
};
