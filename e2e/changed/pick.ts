// Picks the frameworks to run from the files that changed. Pure: the caller
// reads the workspace and git, and this decides.

/** A workspace package as the picker sees it. */
export interface WorkspacePackage {
  readonly name: string;
  /** Its directory relative to the repo root, with forward slashes and no trailing slash. */
  readonly dir: string;
  /** The workspace packages it depends on, from any of its dependency lists. */
  readonly dependsOn: readonly string[];
}

/** A framework and the workspace package of its app. */
export interface FrameworkApp {
  readonly framework: string;
  readonly packageName: string;
}

/** What to run, and why, one line per framework or rule. */
export interface Choice {
  readonly frameworks: readonly string[];
  readonly reasons: readonly string[];
}

/** True for a file that holds no code: docs, Markdown, changesets and issue templates. */
export function isDocs(file: string): boolean {
  return (
    file.startsWith(".changeset/") ||
    file.startsWith(".github/ISSUE_TEMPLATE/") ||
    file.endsWith(".md") ||
    /(^|\/)LICENSE$/.test(file)
  );
}

/** The package whose directory holds `file`, the innermost one when packages nest. */
function ownerOf(file: string, packages: readonly WorkspacePackage[]): WorkspacePackage | undefined {
  let owner: WorkspacePackage | undefined;
  for (const entry of packages) {
    if (!file.startsWith(`${entry.dir}/`)) continue;
    if (owner === undefined || entry.dir.length > owner.dir.length) owner = entry;
  }
  return owner;
}

/** The chain of packages from `start` down its dependencies to a package in `targets`, or undefined. */
function chainTo(
  start: string,
  targets: ReadonlySet<string>,
  byName: ReadonlyMap<string, WorkspacePackage>,
): readonly string[] | undefined {
  const queue: (readonly string[])[] = [[start]];
  const seen = new Set([start]);
  while (true) {
    const chain = queue.shift();
    if (chain === undefined) return undefined;
    const last = chain[chain.length - 1] ?? start;
    if (targets.has(last)) return chain;
    for (const next of byName.get(last)?.dependsOn ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push([...chain, next]);
    }
  }
}

/**
 * Decides which frameworks to run for a list of changed files.
 *
 * - Docs never run anything.
 * - A file outside every workspace package, such as root config or the
 *   lockfile, runs every framework.
 * - A file inside a package runs every framework whose app depends on that
 *   package, directly or through other workspace packages. The suite itself
 *   is a package every app depends on, so a change to it runs everything.
 */
export function pickFrameworks(
  changed: readonly string[],
  packages: readonly WorkspacePackage[],
  apps: readonly FrameworkApp[],
): Choice {
  const all = apps.map((app) => app.framework);
  const code = changed.filter((file) => !isDocs(file));
  if (code.length === 0) {
    return {
      frameworks: [],
      reasons: [changed.length === 0 ? "Nothing changed." : `Only docs changed (${changed.length} files).`],
    };
  }

  const changedPackages = new Map<string, string>();
  for (const file of code) {
    const owner = ownerOf(file, packages);
    if (owner === undefined) {
      return { frameworks: all, reasons: [`Everything: ${file} is outside every workspace package.`] };
    }
    if (!changedPackages.has(owner.name)) changedPackages.set(owner.name, file);
  }

  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const targets = new Set(changedPackages.keys());
  const frameworks: string[] = [];
  const reasons: string[] = [];
  for (const app of apps) {
    const chain = chainTo(app.packageName, targets, byName);
    if (chain === undefined) {
      reasons.push(`${app.framework}: skipped, nothing ${app.packageName} depends on changed.`);
      continue;
    }
    frameworks.push(app.framework);
    const changedName = chain[chain.length - 1] ?? app.packageName;
    const middle = chain.slice(1, -1);
    const link =
      chain.length === 1
        ? ""
        : `, and ${app.packageName} depends on it${middle.length > 0 ? ` through ${middle.join(", ")}` : ""}`;
    reasons.push(`${app.framework}: ${changedName} changed (${changedPackages.get(changedName)})${link}.`);
  }
  return { frameworks, reasons };
}
