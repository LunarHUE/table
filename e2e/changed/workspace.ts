import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspacePackage } from "./pick.js";

/** The parts of a package.json the graph reads. */
interface Manifest {
  readonly name?: string;
  readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] };
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

const isList = (value: Manifest["workspaces"]): value is readonly string[] => Array.isArray(value);

function readManifest(dir: string): Manifest {
  // A package.json is JSON of this shape, or a subset of it.
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

/** Reads every workspace package under `root` and the workspace packages each one depends on. */
export function readWorkspace(root: string): WorkspacePackage[] {
  const { workspaces = [] } = readManifest(root);
  const patterns = isList(workspaces) ? workspaces : (workspaces.packages ?? []);
  const dirs = [...new Set(patterns.flatMap((pattern) => expand(root, pattern)))];
  const manifests = dirs.map((dir) => ({ dir, manifest: readManifest(join(root, dir)) }));
  const names = new Set(manifests.flatMap(({ manifest }) => (manifest.name === undefined ? [] : [manifest.name])));
  return manifests.flatMap(({ dir, manifest }) => {
    if (manifest.name === undefined) return [];
    const listed = [
      manifest.dependencies,
      manifest.devDependencies,
      manifest.peerDependencies,
      manifest.optionalDependencies,
    ].flatMap((list) => Object.keys(list ?? {}));
    return [{ name: manifest.name, dir, dependsOn: [...new Set(listed.filter((name) => names.has(name)))] }];
  });
}
