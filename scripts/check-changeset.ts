// Fails when a pull request changes what a published package ships and adds
// no changeset. Run with bun from the repo root:
//
//   bun scripts/check-changeset.ts origin/main
//
// The argument is the base the pull request merges into. CI skips this check
// itself when the pull request has the no-changeset label.
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkChangeset } from "./changeset.js";
import { readWorkspace } from "./workspace.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const base = process.argv[2];
if (base === undefined) throw new Error("Pass the base ref, such as origin/main.");

/** Files changed since the merge base with `base`, limited by `git diff` filter flags. */
const diff = (...flags: string[]): string[] =>
  execFileSync("git", ["diff", "--name-only", ...flags, `${base}...HEAD`], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "");

const verdict = checkChangeset(diff(), diff("--diff-filter=A"), readWorkspace(root));
for (const reason of verdict.reasons) console.log(reason);
process.exit(verdict.ok ? 0 : 1);
