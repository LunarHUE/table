// Runs the end-to-end suite. Run with bun from the repo root:
//
//   bun run e2e                                 every framework major
//   bun run e2e:changed                         majors touched since origin/main
//   bun run e2e:changed --base <ref>            ... since another ref
//   bun run e2e:changed --framework react18     only the majors named
//   bun run e2e:changed --newest                only the newest major of each framework
//   bun run e2e:changed --dry-run               print the choice, run nothing
//   bun run e2e -- -- --grep "sorting"          anything after -- goes to Playwright
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Choice, type FrameworkApp, pickFrameworks } from "./changed/pick.js";
import { readWorkspace } from "./changed/workspace.js";
import { frameworks } from "./contract/frameworks.js";

const suite = dirname(fileURLToPath(import.meta.url));
const root = dirname(suite);

interface Args {
  all: boolean;
  named: string[];
  newest: boolean;
  base: string;
  dryRun: boolean;
  playwright: string[];
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { all: false, named: [], newest: false, base: "origin/main", dryRun: false, playwright: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const value = (): string => {
      index += 1;
      const next = argv[index];
      if (next === undefined) throw new Error(`${arg} needs a value.`);
      return next;
    };
    if (arg === "--") {
      args.playwright = argv.slice(index + 1);
      break;
    }
    if (arg === "--all") args.all = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--newest") args.newest = true;
    else if (arg === "--framework") args.named.push(value());
    else if (arg.startsWith("--framework=")) args.named.push(arg.slice("--framework=".length));
    else if (arg === "--base") args.base = value();
    else if (arg.startsWith("--base=")) args.base = arg.slice("--base=".length);
    else throw new Error(`Unknown argument ${arg}. Pass Playwright's own arguments after --.`);
  }
  return args;
}

const git = (...args: string[]): string[] =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");

/** Files changed since the merge base with `base`, committed or not, untracked included. */
function changedFiles(base: string): string[] {
  return [
    ...new Set([
      ...git("diff", "--name-only", `${base}...HEAD`),
      ...git("diff", "--name-only", "HEAD"),
      ...git("ls-files", "--others", "--exclude-standard"),
    ]),
  ];
}

/** Each framework with its app's package name, read from `apps/<name>/package.json`. */
function frameworkApps(): FrameworkApp[] {
  return frameworks.map((framework) => {
    // An app's package.json has a name.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const manifest = JSON.parse(readFileSync(join(suite, "apps", framework.name, "package.json"), "utf8")) as {
      name: string;
    };
    return { framework: framework.name, packageName: manifest.name };
  });
}

function choose(args: Args): Choice {
  const known = frameworks.map((framework) => framework.name);
  if (args.all) return { frameworks: known, reasons: ["Everything: --all."] };
  if (args.named.length > 0) {
    const unknown = args.named.filter((name) => !known.includes(name));
    if (unknown.length > 0) throw new Error(`Unknown framework ${unknown.join(", ")}. Known: ${known.join(", ")}.`);
    return { frameworks: args.named, reasons: [`Named with --framework: ${args.named.join(", ")}.`] };
  }
  const changed = changedFiles(args.base);
  const choice = pickFrameworks(changed, readWorkspace(root), frameworkApps());
  return { frameworks: choice.frameworks, reasons: [`${changed.length} files changed since ${args.base}.`, ...choice.reasons] };
}

/** Keeps the newest major of each framework when `--newest` asks for it. */
function newestOnly(choice: Choice): Choice {
  const dropped = choice.frameworks.filter((name) => !frameworks.some((entry) => entry.name === name && entry.newest));
  if (dropped.length === 0) return choice;
  return {
    frameworks: choice.frameworks.filter((name) => !dropped.includes(name)),
    reasons: [...choice.reasons, `Not the newest major, so left out by --newest: ${dropped.join(", ")}.`],
  };
}

const args = parseArgs(process.argv.slice(2));
const chosen = choose(args);
const choice = args.newest ? newestOnly(chosen) : chosen;
for (const reason of choice.reasons) console.log(reason);
console.log(choice.frameworks.length === 0 ? "Nothing to run." : `Running: ${choice.frameworks.join(", ")}.`);
if (args.dryRun || choice.frameworks.length === 0) process.exit(0);

const result = spawnSync(
  "bun",
  ["x", "playwright", "test", ...choice.frameworks.flatMap((name) => ["--project", name]), ...args.playwright],
  {
    cwd: suite,
    stdio: "inherit",
    env: {
      ...process.env,
      // Only the chosen apps are built and served.
      E2E_FRAMEWORKS: choice.frameworks.join(","),
      // Specs import the contract, which imports the library from source.
      NODE_OPTIONS: [process.env["NODE_OPTIONS"], "--conditions=@lunarhue/source"].filter(Boolean).join(" "),
    },
  },
);
process.exit(result.status ?? 1);
