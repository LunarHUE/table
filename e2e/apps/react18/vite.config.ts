import { defineConfig } from "vite";
import { appConfig, pinFramework } from "../../vite.base.ts";

// Vite compiles the JSX itself, from the tsconfig's `react-jsx`.
export default defineConfig(({ isSsrBuild }) => appConfig([pinFramework(["react", "react-dom"])], isSsrBuild === true));
