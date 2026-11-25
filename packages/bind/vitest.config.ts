import { packageTests } from "../../vitest.base.ts";

// Solid's browser build, since its node build is the server one. Vite turns
// the second condition into `development`, or `production` when NODE_ENV is
// production.
export default packageTests({ conditions: ["browser", "development|production"] });
