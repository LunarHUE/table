import { packageTests } from "../../vitest.base.ts";

// Solid's browser build, since its node build is the server one. Vite turns
// the second condition into `development`, or `production` when NODE_ENV is
// production.
const base = packageTests({ conditions: ["browser", "development|production"] });

// The nuqs tests render React, so they are .test.tsx and pick jsdom in a
// comment at the top of the file.
export default {
  ...base,
  test: { ...base.test, include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
};
