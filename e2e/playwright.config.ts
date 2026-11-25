import { availableParallelism } from "node:os";
import { defineConfig, devices } from "@playwright/test";
import { type Framework, frameworks } from "./contract/index.js";
import type { Options } from "./specs/fixtures.js";

// `run.ts` sets E2E_FRAMEWORKS to the frameworks it picked, so only their
// apps are built and served. Without it every framework runs.
const picked = process.env["E2E_FRAMEWORKS"]?.split(",").filter((name) => name !== "");
const selected: readonly Framework[] =
  picked === undefined ? frameworks : frameworks.filter((framework) => picked.includes(framework.name));

// E2E_BROWSER runs every framework in another browser. Unset or empty, it is Chromium.
const browsers = { chromium: "Desktop Chrome", firefox: "Desktop Firefox", webkit: "Desktop Safari" } as const;
const isBrowser = (name: string): name is keyof typeof browsers => Object.hasOwn(browsers, name);
const browser = process.env["E2E_BROWSER"] || "chromium";
if (!isBrowser(browser)) {
  throw new Error(`E2E_BROWSER is ${browser}. Use one of ${Object.keys(browsers).join(", ")}.`);
}
const device = devices[browsers[browser]];

const origin = (framework: Framework): string => `http://127.0.0.1:${framework.port}`;

export default defineConfig<Options>({
  testDir: "specs",
  fullyParallel: true,
  // Playwright's default counts every core of the host, which in a container
  // can be far more than the container may use. This counts the usable ones.
  workers: Math.max(1, Math.floor(availableParallelism() / 2)),
  forbidOnly: process.env["CI"] !== undefined,
  reporter: [["list"], ["./skips.ts"], ...(process.env["CI"] === undefined ? [] : [["html", { open: "never" }] as const])],
  use: { trace: "retain-on-failure" },
  // One project per framework, all running the same specs.
  projects: selected.map((framework) => ({
    name: framework.name,
    use: { ...device, baseURL: origin(framework), framework },
  })),
  // One production build and one server per framework, stopped when the run ends.
  webServer: selected.map((framework) => ({
    command: `bun run --cwd apps/${framework.name} build && node server.ts apps/${framework.name} ${framework.port}`,
    url: origin(framework),
    env: { NODE_ENV: "production" },
    reuseExistingServer: false,
    timeout: 120_000,
  })),
});
