import solid from "@solidjs/vite-plugin";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  // Leave the dependencies to Vite. Solid's plugin compiles this app's JSX.
  plugins: [solid({ exclude: [/\/node_modules\//] })],
  // The workspace packages export their source under this condition, so the
  // example runs the library straight from `packages/` with no build first.
  resolve: { conditions: ["@lunarhue/source", ...defaultClientConditions] },
});
