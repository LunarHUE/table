// Decides whether a pull request needs a changeset. Pure: `check-changeset.ts`
// reads git and the workspace, and this decides.

/** A workspace package as the check sees it. */
export interface Package {
  readonly name: string;
  /** Its directory relative to the repo root, with forward slashes and no trailing slash. */
  readonly dir: string;
  /** False for a package marked `private`, which is never released. */
  readonly published: boolean;
}

/** What the check found, one line per reason. */
export interface Verdict {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

// Paths inside a package that never reach what it ships: tests, test config
// and Markdown.
const unshipped = [
  /\.test(-d)?\.tsx?$/,
  /\.bench\.tsx?$/,
  /(^|\/)(test|tests|__tests__)\//,
  /(^|\/)vitest\.[^/]*config\.ts$/,
  /\.md$/,
];

/** True for a new changeset file. The README changesets writes is not one. */
export function isChangeset(file: string): boolean {
  return /^\.changeset\/[^/]+\.md$/.test(file) && file !== ".changeset/README.md";
}

/** The published package `file` ships from, or undefined. The innermost package owns a file. */
export function shippedBy(file: string, packages: readonly Package[]): Package | undefined {
  let owner: Package | undefined;
  for (const entry of packages) {
    if (!file.startsWith(`${entry.dir}/`)) continue;
    if (owner === undefined || entry.dir.length > owner.dir.length) owner = entry;
  }
  if (owner === undefined || !owner.published) return undefined;
  const inside = file.slice(owner.dir.length + 1);
  return unshipped.some((pattern) => pattern.test(inside)) ? undefined : owner;
}

/**
 * Checks a pull request's files. `changed` is every file it touches, `added`
 * the files it adds. It passes when no published package's shipped files
 * changed, or when it adds a changeset.
 */
export function checkChangeset(
  changed: readonly string[],
  added: readonly string[],
  packages: readonly Package[],
): Verdict {
  const touched = new Map<string, string>();
  for (const file of changed) {
    const owner = shippedBy(file, packages);
    if (owner !== undefined && !touched.has(owner.name)) touched.set(owner.name, file);
  }
  if (touched.size === 0) return { ok: true, reasons: ["No published package's source changed."] };
  const lines = [...touched].map(([name, file]) => `${name} changed (${file}).`);
  const changesets = added.filter(isChangeset);
  if (changesets.length > 0) return { ok: true, reasons: [...lines, `Changeset added: ${changesets.join(", ")}.`] };
  return {
    ok: false,
    reasons: [
      ...lines,
      "No changeset added. Run `bunx changeset` and commit the file, or label the pull request no-changeset.",
    ],
  };
}
