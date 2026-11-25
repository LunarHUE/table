import { defineConfig } from "vite";
import { appConfig, pinFramework, withCondition } from "../../vite.base.ts";

// Vite compiles the JSX itself, from the tsconfig's `react-jsx`. React 17 has
// no `useSyncExternalStore` or `useId`, so the adapter takes its fallbacks
// under the condition.
export default defineConfig(({ isSsrBuild }) =>
  withCondition(appConfig([pinFramework(["react", "react-dom"])], isSsrBuild === true), "@lunarhue/react-legacy"),
);
