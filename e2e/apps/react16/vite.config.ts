import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { appConfig, pinFramework, withCondition } from "../../vite.base.ts";

// React 16.8 ships no JSX runtime, so the JSX Vite compiles calls this one.
const jsxRuntime = fileURLToPath(new URL("src/jsx-runtime.ts", import.meta.url));

// React 16.8 has no `useSyncExternalStore` or `useId`, so the adapter takes its
// fallbacks under this condition.
export default defineConfig(({ isSsrBuild }) =>
  withCondition(
    appConfig(
      [
        pinFramework(["react", "react-dom"], {
          "react/jsx-runtime": jsxRuntime,
          "react/jsx-dev-runtime": jsxRuntime,
        }),
      ],
      isSsrBuild === true,
    ),
    "@lunarhue/react-legacy",
  ),
);
