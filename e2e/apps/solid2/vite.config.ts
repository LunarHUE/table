import solid from "@solidjs/vite-plugin";
import { defineConfig } from "vite";
import { appConfig, notSolid, pinFramework } from "../../vite.base.ts";

// `ssr: true` compiles hydratable DOM code for the client and SSR code for the server.
export default defineConfig(({ isSsrBuild }) =>
  appConfig([pinFramework(["solid-js", "@solidjs/web"]), solid({ ssr: true, exclude: notSolid })], isSsrBuild === true),
);
