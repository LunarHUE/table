// Rewrites a packed package.json. Pure: `pack.ts` reads and writes the tarball, and this
// decides what the manifest says.

/** `value` with every `condition` key removed, at any depth. */
function dropKey(value: unknown, condition: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => dropKey(entry, condition));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== condition)
      .map(([key, entry]) => [key, dropKey(entry, condition)]),
  );
}

/**
 * The package.json text with `condition` taken out of its `exports` and `imports` maps. Only
 * those fields are touched, so a dependency that happens to share the name stays.
 */
export function withoutCondition(manifest: string, condition: string): string {
  const parsed: unknown = JSON.parse(manifest);
  if (typeof parsed !== "object" || parsed === null) return manifest;
  if (!("exports" in parsed) && !("imports" in parsed)) return manifest;
  // Spreading keeps `exports` and `imports` where they were among the other keys.
  const next: Record<string, unknown> = { ...parsed };
  if ("exports" in parsed) next.exports = dropKey(parsed.exports, condition);
  if ("imports" in parsed) next.imports = dropKey(parsed.imports, condition);
  return `${JSON.stringify(next, undefined, 2)}\n`;
}
