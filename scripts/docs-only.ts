// Prints `true` when every file changed since the merge base with a ref is
// docs, and `false` otherwise. CI runs it before installing anything, so it
// imports nothing outside Node. Run with bun from the repo root:
//
//   bun scripts/docs-only.ts origin/main
//
// With no ref, or a ref git can't find, it prints `false`, so everything runs.
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const git = (...args: string[]): string => execFileSync("git", args, { cwd: root, encoding: "utf8" });

/** True for a file that changes no code: changesets, issue templates, Markdown and licenses. */
function isDocs(file: string): boolean {
  return (
    file.startsWith(".changeset/") ||
    file.startsWith(".github/ISSUE_TEMPLATE/") ||
    file.endsWith(".md") ||
    /(^|\/)LICENSE$/.test(file)
  );
}

function docsOnly(base: string | undefined): boolean {
  if (base === undefined || base === "") {
    console.error("No base to compare with.");
    return false;
  }
  try {
    git("rev-parse", "--verify", "--quiet", `${base}^{commit}`);
  } catch {
    console.error(`${base} is not a commit here.`);
    return false;
  }
  const changed = git("diff", "--name-only", `${base}...HEAD`)
    .split("\n")
    .filter((line) => line !== "");
  const code = changed.filter((file) => !isDocs(file));
  console.error(
    code.length === 0 ? `Only docs changed since ${base} (${changed.length} files).` : `Code changed: ${code[0]}.`,
  );
  return changed.length > 0 && code.length === 0;
}

console.log(docsOnly(process.argv[2]) ? "true" : "false");
