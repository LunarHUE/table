// Lists the workspace packages. It imports nothing outside Node, so a script
// that runs before `bun install` can use it.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A workspace package and its directory relative to the repo root. */
export interface WorkspacePackage {
  readonly name: string;
  /** Forward slashes, no trailing slash. */
  readonly dir: string;
  /** False for a package marked `private`, which is never released. */
  readonly published: boolean;
}

/** The parts of a package.json this reads. */
interface Manifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] };
}

const isList = (value: Manifest["workspaces"]): value is readonly string[] => Array.isArray(value);

function readManifest(dir: string): Manifest {
  // A package.json is JSON of this shape, or a superset of it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Manifest;
}

/** Expands one workspace pattern. Bun's patterns here are a directory, or a directory ending in `/*`. */
function expand(root: string, pattern: string): string[] {
  if (!pattern.endsWith("/*")) return existsSync(join(root, pattern, "package.json")) ? [pattern] : [];
  const base = pattern.slice(0, -2);
  if (!existsSync(join(root, base))) return [];
  return readdirSync(join(root, base), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, base, entry.name, "package.json")))
    .map((entry) => `${base}/${entry.name}`);
}

/** Reads every workspace package under `root`. */
export function readWorkspace(root: string): WorkspacePackage[] {
  const { workspaces = [] } = readManifest(root);
  const patterns = isList(workspaces) ? workspaces : (workspaces.packages ?? []);
  const dirs = [...new Set(patterns.flatMap((pattern) => expand(root, pattern)))];
  return dirs.flatMap((dir) => {
    const manifest = readManifest(join(root, dir));
    if (manifest.name === undefined) return [];
    return [{ name: manifest.name, dir, published: manifest.private !== true }];
  });
}
