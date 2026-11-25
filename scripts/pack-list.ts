// Reads which files a package ships. Pure: `pack.ts` runs npm and tar, and this reads
// their output.

/** One file npm would put in the tarball, with its path relative to the package directory. */
export interface PackedFile {
  readonly path: string;
  readonly mode: number;
}

/** The files in the output of `npm pack --dry-run --json`, run on a single package. */
export function parsePackList(json: string): PackedFile[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length !== 1) throw new Error("npm pack did not list exactly one package.");
  const entry: unknown = parsed[0];
  if (typeof entry !== "object" || entry === null || !("files" in entry) || !Array.isArray(entry.files)) {
    throw new Error("npm pack listed no files.");
  }
  return entry.files.map((file: unknown) => {
    if (typeof file !== "object" || file === null) throw new Error("npm pack listed a file that isn't an object.");
    if (!("path" in file) || typeof file.path !== "string" || !("mode" in file) || typeof file.mode !== "number") {
      throw new Error(`npm pack listed a file without a path and mode: ${JSON.stringify(file)}.`);
    }
    return { path: file.path, mode: file.mode };
  });
}

/** The paths in a `tar -tzf` listing of an npm tarball, without the `package/` prefix. */
export function tarPaths(listing: string): string[] {
  return listing
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => (line.startsWith("package/") ? line.slice("package/".length) : line));
}

/** Each path in only one of the lists: `- path` when the tarball lacks it, `+ path` when only the tarball has it. */
export function fileDiff(expected: readonly string[], actual: readonly string[]): string[] {
  const want = new Set(expected);
  const have = new Set(actual);
  return [
    ...expected.filter((path) => !have.has(path)).map((path) => `- ${path}`),
    ...actual.filter((path) => !want.has(path)).map((path) => `+ ${path}`),
  ];
}
