// Reports how a pull request changes bundle sizes, for the comment CI posts.
// `measure` runs size:tables (when present) and every package's size-limit in
// a checkout that is already installed and built, and prints one JSON
// snapshot. `compare` reads two snapshots and prints the report in Markdown.
// Run from the repo root:
//
//   bun scripts/size-report.ts measure > head.json
//   bun scripts/size-report.ts measure --root ../base > base.json
//   bun scripts/size-report.ts compare base.json head.json --base main --sha "$(git rev-parse HEAD)"
//
// `measure --root` runs the other checkout's own size:tables and size-limit,
// so the base can be an older commit. A size:tables from before --json prints
// a Markdown table, and this reads the table instead. A base snapshot that
// doesn't exist, because the base failed to build, gives a report of the
// pull request's sizes alone.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/** Brotli bytes of each size:tables fixture, one column per framework and mode. */
export interface TableSizes {
  readonly columns: readonly string[];
  readonly rows: readonly TableRow[];
}

export interface TableRow {
  readonly name: string;
  readonly sizes: Readonly<Record<string, number>>;
}

/** One entry of a package's size-limit list. */
export interface LimitSize {
  readonly package: string;
  readonly name: string;
  readonly size: number;
  /** Absent for the entries that print a size and check nothing. */
  readonly limit?: number;
}

interface CompareSize {
  readonly brotli: number;
}

/** The `apps` of examples/compare/sizes.json: app, then library, then build. */
export type CompareSizes = Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, CompareSize>>>>>>;

export interface Snapshot {
  /** Null when the checkout has no size:tables. */
  readonly tables: TableSizes | null;
  readonly limits: readonly LimitSize[];
  /** Null when the checkout has no examples/compare/sizes.json. */
  readonly compare: CompareSizes | null;
}

export type Source = "size:tables" | "size-limit";

/** One entry on both sides. Undefined on a side means the entry isn't there. */
export interface Change {
  readonly source: Source;
  /** The fixture for size:tables, the package for size-limit. */
  readonly group: string;
  /** The column for size:tables, the entry's name for size-limit. */
  readonly entry: string;
  readonly base: number | undefined;
  readonly head: number | undefined;
  readonly baseLimit: number | undefined;
  readonly headLimit: number | undefined;
}

export interface CompareChange {
  readonly app: string;
  readonly library: string;
  readonly build: string;
  readonly base: number | undefined;
  readonly head: number | undefined;
}

/** Moves smaller than this many bytes stay out of the changed table. */
export const threshold = 10;

/** The share of a limit past which an entry counts as close to it. */
export const nearLimit = 0.98;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isTableSizes(value: unknown): value is TableSizes {
  if (!isRecord(value) || !Array.isArray(value["columns"]) || !Array.isArray(value["rows"])) return false;
  return (
    value["columns"].every((column) => typeof column === "string") &&
    value["rows"].every(
      (row) =>
        isRecord(row) &&
        typeof row["name"] === "string" &&
        isRecord(row["sizes"]) &&
        Object.values(row["sizes"]).every((size) => typeof size === "number"),
    )
  );
}

function isCompareSizes(value: unknown): value is CompareSizes {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (libraries) =>
        isRecord(libraries) &&
        Object.values(libraries).every(
          (builds) =>
            isRecord(builds) &&
            Object.values(builds).every((size) => isRecord(size) && typeof size["brotli"] === "number"),
        ),
    )
  );
}

function isSnapshot(value: unknown): value is Snapshot {
  return (
    isRecord(value) &&
    (value["tables"] === null || isTableSizes(value["tables"])) &&
    Array.isArray(value["limits"]) &&
    value["limits"].every(
      (limit) =>
        isRecord(limit) &&
        typeof limit["package"] === "string" &&
        typeof limit["name"] === "string" &&
        typeof limit["size"] === "number" &&
        (limit["limit"] === undefined || typeof limit["limit"] === "number"),
    ) &&
    (value["compare"] === null || isCompareSizes(value["compare"]))
  );
}

const cells = (line: string): string[] =>
  line
    .slice(1, line.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());

/** Reads the Markdown table an older size:tables prints: a label, then `1,234 B` cells. */
export function parseTablesTable(markdown: string): TableSizes {
  const lines = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"));
  const [header, , ...body] = lines;
  if (header === undefined) throw new Error("size:tables printed no table.");
  const columns = cells(header).slice(1);
  const rows = body.map((line) => {
    const [name = "", ...values] = cells(line);
    const sizes: Record<string, number> = {};
    for (const [index, column] of columns.entries()) {
      const digits = (values[index] ?? "").replace(/[^\d]/g, "");
      if (digits.length > 0) sizes[column] = Number(digits);
    }
    return { name, sizes };
  });
  return { columns, rows };
}

/** `@lunarhue/table-react` becomes `react`. */
export const shortPackage = (name: string): string => name.replace(/^@lunarhue\/table-/, "");

const key = (group: string, entry: string): string => `${group}\u0000${entry}`;

/** The keys of `first` in order, then the keys only `second` has. */
function union<K>(first: ReadonlyMap<K, unknown>, second: ReadonlyMap<K, unknown>): K[] {
  return [...first.keys(), ...[...second.keys()].filter((name) => !first.has(name))];
}

interface Measured {
  readonly group: string;
  readonly entry: string;
  readonly size: number;
  readonly limit: number | undefined;
}

function tableEntries(tables: TableSizes | null | undefined): Map<string, Measured> {
  const entries = new Map<string, Measured>();
  for (const row of tables?.rows ?? []) {
    for (const column of tables?.columns ?? []) {
      const size = row.sizes[column];
      if (size !== undefined) entries.set(key(row.name, column), { group: row.name, entry: column, size, limit: undefined });
    }
  }
  return entries;
}

function limitEntries(limits: readonly LimitSize[] | undefined): Map<string, Measured> {
  const entries = new Map<string, Measured>();
  for (const limit of limits ?? []) {
    const group = shortPackage(limit.package);
    entries.set(key(group, limit.name), { group, entry: limit.name, size: limit.size, limit: limit.limit });
  }
  return entries;
}

function pair(source: Source, base: Map<string, Measured>, head: Map<string, Measured>): Change[] {
  return union(head, base).map((name) => {
    const before = base.get(name);
    const after = head.get(name);
    const either = after ?? before;
    if (either === undefined) throw new Error(`Lost the entry ${name}.`);
    return {
      source,
      group: either.group,
      entry: either.entry,
      base: before?.size,
      head: after?.size,
      baseLimit: before?.limit,
      headLimit: after?.limit,
    };
  });
}

/** Every size:tables and size-limit entry on either side, the head's order first. */
export function diff(base: Snapshot | null, head: Snapshot): Change[] {
  return [
    ...pair("size:tables", tableEntries(base?.tables), tableEntries(head.tables)),
    ...pair("size-limit", limitEntries(base?.limits), limitEntries(head.limits)),
  ];
}

/** Brotli sizes of the comparison apps that differ between the sides. */
export function diffCompare(base: Snapshot | null, head: Snapshot): CompareChange[] {
  const flatten = (sizes: CompareSizes | null | undefined): Map<string, CompareChange> => {
    const entries = new Map<string, CompareChange>();
    for (const [app, libraries] of Object.entries(sizes ?? {})) {
      for (const [library, builds] of Object.entries(libraries)) {
        for (const [build, size] of Object.entries(builds)) {
          entries.set(`${app}/${library}/${build}`, { app, library, build, base: undefined, head: size.brotli });
        }
      }
    }
    return entries;
  };
  if (base === null) return [];
  const before = flatten(base.compare);
  const after = flatten(head.compare);
  return union(after, before)
    .map((name) => {
      const entry = after.get(name) ?? before.get(name);
      if (entry === undefined) throw new Error(`Lost the comparison entry ${name}.`);
      return { ...entry, base: before.get(name)?.head, head: after.get(name)?.head };
    })
    .filter((change) => change.base !== change.head);
}

const isNear = (size: number, limit: number): boolean => size >= limit * nearLimit;

/**
 * True when an entry belongs in the changed table: it's new or gone, it moved
 * by at least `threshold` bytes, its limit changed, it went over its limit,
 * or it crossed into the last stretch below it.
 */
export function notable({ base, head, baseLimit, headLimit }: Change): boolean {
  if (base === undefined || head === undefined) return true;
  if (Math.abs(head - base) >= threshold) return true;
  if (baseLimit !== headLimit) return true;
  if (headLimit === undefined) return false;
  return head > headLimit || (isNear(head, headLimit) && !isNear(base, headLimit));
}

/** The size-limit entries whose limit went up. */
export const raisedLimits = (changes: readonly Change[]): Change[] =>
  changes.filter(
    (change) => change.baseLimit !== undefined && change.headLimit !== undefined && change.headLimit > change.baseLimit,
  );

export const bytes = (size: number): string => `${size.toLocaleString("en-US")} B`;

const sign = (change: number): string => (change > 0 ? "+" : change < 0 ? "-" : "");

const signedBytes = (change: number): string => `${sign(change)}${bytes(Math.abs(change))}`;

/** `+62 B / +0.6%`. The percentage is of the base. */
export function delta(base: number, head: number): string {
  const change = head - base;
  if (base === 0) return signedBytes(change);
  const percent = ((Math.abs(change) / base) * 100).toFixed(1);
  return `${signedBytes(change)} / ${sign(change)}${percent}%`;
}

const line = (values: readonly string[]): string => `| ${values.join(" | ")} |`;

/** `align` has an `l` or `r` per column. */
function table(header: readonly string[], align: string, rows: readonly (readonly string[])[]): string {
  return [
    line(header),
    line(header.map((_, index) => (align[index] === "r" ? "---:" : "---"))),
    ...rows.map(line),
  ].join("\n");
}

const sides = (base: number | undefined, head: number | undefined): string =>
  `${base === undefined ? "none" : bytes(base)} → ${head === undefined ? "none" : bytes(head)}`;

function deltaCell(base: number | undefined, head: number | undefined): string {
  if (base !== undefined && head !== undefined) return delta(base, head);
  if (head !== undefined) return "new";
  return "removed";
}

const label = ({ source, group, entry }: Change): string =>
  source === "size:tables" ? `${group} (${entry})` : `${group}: ${entry}`;

/** What the numbers alone don't say: a limit that changed, or one that's close. */
function note({ base, head, baseLimit, headLimit }: Change): string {
  const notes: string[] = [];
  // A new or removed entry takes its limit with it, which needs no note.
  if (base !== undefined && head !== undefined && baseLimit !== headLimit) {
    if (headLimit === undefined) notes.push("limit removed");
    else if (baseLimit === undefined) notes.push(`limit set to ${bytes(headLimit)}`);
    else notes.push(`limit ${headLimit > baseLimit ? "raised" : "lowered"} to ${bytes(headLimit)}`);
  }
  if (head !== undefined && headLimit !== undefined) {
    if (head > headLimit) notes.push(`over the ${bytes(headLimit)} limit`);
    else if (isNear(head, headLimit)) notes.push(`${bytes(headLimit - head)} under the limit`);
  }
  return notes.join(", ");
}

function changedTable(changes: readonly Change[]): string {
  const notes = changes.map(note);
  const withNotes = notes.some((text) => text !== "");
  const header = ["Check", "Entry", "Base → PR", "Δ", ...(withNotes ? ["Note"] : [])];
  const rows = changes.map((item, index) => [
    `\`${item.source}\``,
    label(item),
    sides(item.base, item.head),
    deltaCell(item.base, item.head),
    ...(withNotes ? [notes[index] ?? ""] : []),
  ]);
  return table(header, "llrrl", rows);
}

function tablesTable(changes: readonly Change[], compared: boolean): string {
  const tables = changes.filter((item) => item.source === "size:tables");
  const columns = [...new Set(tables.map((item) => item.entry))];
  const groups = [...new Set(tables.map((item) => item.group))];
  const rows = groups.map((group) => [
    group,
    ...columns.map((column) => {
      const item = tables.find((candidate) => candidate.group === group && candidate.entry === column);
      if (item === undefined) return "n/a";
      if (item.head === undefined) return "removed";
      if (!compared || item.base === undefined || item.base === item.head) return bytes(item.head);
      return `${bytes(item.head)} (${signedBytes(item.head - item.base)})`;
    }),
  ]);
  return table(["Table", ...columns], `l${"r".repeat(columns.length)}`, rows);
}

function headroom(size: number, limit: number): string {
  if (size > limit) return `over by ${bytes(size - limit)}`;
  return `${bytes(limit - size)} (${(((limit - size) / limit) * 100).toFixed(1)}%)`;
}

function limitsTable(changes: readonly Change[], compared: boolean): string {
  const rows = changes
    .filter((item) => item.source === "size-limit")
    .map((item) => {
      const limit =
        item.headLimit === undefined
          ? item.head === undefined
            ? ""
            : "none"
          : compared && item.baseLimit !== undefined && item.baseLimit !== item.headLimit
            ? sides(item.baseLimit, item.headLimit)
            : bytes(item.headLimit);
      return [
        item.group,
        item.entry,
        item.head === undefined ? "removed" : bytes(item.head),
        compared ? deltaCell(item.base, item.head) : "",
        limit,
        item.head === undefined || item.headLimit === undefined ? "" : headroom(item.head, item.headLimit),
      ];
    });
  return table(["Package", "Entry", "Size", "Δ", "Limit", "Headroom"], "llrrrr", rows);
}

const buildTitles: Readonly<Record<string, string>> = { total: "Total", table: "Table + app", app: "App only" };

function compareTable(changes: readonly CompareChange[]): string {
  const rows = changes.map((item) => [
    item.app,
    item.library,
    buildTitles[item.build] ?? item.build,
    sides(item.base, item.head),
    deltaCell(item.base, item.head),
  ]);
  return table(["App", "Library", "Build", "Base → PR", "Δ"], "lllrr", rows);
}

function details(summary: string, body: string): string {
  return `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
}

export const marker = "<!-- size-report -->";

export interface ReportOptions {
  /** The branch the pull request merges into. */
  readonly base: string;
  /** The commit measured. */
  readonly sha: string;
}

/** The comment: what moved on top, every number folded away below. */
export function report(base: Snapshot | null, head: Snapshot, { base: branch, sha }: ReportOptions): string {
  const changes = diff(base, head);
  // A side without size:tables has nothing to compare with, so its fixtures
  // aren't news.
  const tablesCompared = base?.tables != null && head.tables !== null;
  const limitsCompared = base !== null;
  const moved = changes.filter(
    (item) => (item.source === "size:tables" ? tablesCompared : limitsCompared) && notable(item),
  );
  const raised = limitsCompared ? raisedLimits(changes) : [];
  const compare = diffCompare(base, head);

  const sections: string[] = [marker, "### Bundle size", `\`${sha.slice(0, 7)}\` vs \`${branch}\``];
  if (base === null) {
    sections.push(`The merge base couldn't be measured, so there is nothing to compare with. These are this pull request's sizes alone.`);
  } else if (moved.length === 0) {
    sections.push(`No significant bundle size changes vs \`${branch}\`.`);
  } else {
    sections.push(
      `**Changed sizes**\n\n${changedTable(moved)}`,
      `Bytes, brotli unless the entry says otherwise. Moves under ${threshold} B are only in the full tables below.`,
    );
  }
  if (base !== null && head.tables !== null && base.tables === null) {
    sections.push("The base has no `size:tables`, so the table sizes below have nothing to compare with.");
  }
  if (raised.length > 0) {
    const list = raised
      .map((item) => {
        const { baseLimit = 0, headLimit = 0 } = item;
        return `- ${label(item)}, ${bytes(baseLimit)} → ${bytes(headLimit)} (${signedBytes(headLimit - baseLimit)})`;
      })
      .join("\n");
    sections.push(`**Raised limits.** Say why in the pull request description.\n\n${list}`);
  }
  if (compare.length > 0) {
    sections.push(`**Comparison apps** (brotli, from \`examples/compare/sizes.json\`)\n\n${compareTable(compare)}`);
  }
  if (head.tables !== null) {
    sections.push(
      details(
        "All table sizes (<code>size:tables</code>)",
        `Minified, brotli. React and Solid are external.\n\n${tablesTable(changes, tablesCompared)}`,
      ),
    );
  }
  sections.push(details("All size-limit entries", limitsTable(changes, limitsCompared)));
  return `${sections.join("\n\n")}\n`;
}

interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function run(command: string, args: readonly string[], cwd: string): Run {
  // The scripts write their own tables to the job summary otherwise.
  const env = { ...process.env };
  delete env["GITHUB_STEP_SUMMARY"];
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function measureTables(root: string): TableSizes | null {
  if (!existsSync(join(root, "scripts", "size-tables.ts"))) return null;
  const result = run("bun", ["scripts/size-tables.ts", "--json"], root);
  if (result.status !== 0) throw new Error(`size:tables failed in ${root}:\n${result.stderr}`);
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    if (isTableSizes(parsed)) return parsed;
  } catch {
    // An older size:tables ignores --json and prints its table.
  }
  return parseTablesTable(result.stdout);
}

function measureLimits(root: string): LimitSize[] {
  const packages = join(root, "packages");
  const limits: LimitSize[] = [];
  for (const dir of readdirSync(packages).toSorted()) {
    const manifestFile = join(packages, dir, "package.json");
    if (!existsSync(manifestFile)) continue;
    const manifest: unknown = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (!isRecord(manifest) || typeof manifest["name"] !== "string" || !Array.isArray(manifest["size-limit"])) continue;
    // size-limit exits with 1 when an entry is over its limit and still prints them all.
    const result = run("bun", ["x", "size-limit", "--json"], join(packages, dir));
    let entries: unknown;
    try {
      entries = JSON.parse(result.stdout);
    } catch {
      throw new Error(`size-limit failed in packages/${dir}:\n${result.stderr || result.stdout}`);
    }
    if (!Array.isArray(entries)) throw new Error(`size-limit printed no list in packages/${dir}.`);
    for (const entry of entries) {
      if (!isRecord(entry) || typeof entry["name"] !== "string" || typeof entry["size"] !== "number") continue;
      const limit = entry["sizeLimit"];
      limits.push({
        package: manifest["name"],
        name: entry["name"],
        size: entry["size"],
        ...(typeof limit === "number" ? { limit } : {}),
      });
    }
  }
  return limits;
}

function readCompare(root: string): CompareSizes | null {
  const file = join(root, "examples", "compare", "sizes.json");
  if (!existsSync(file)) return null;
  const sizes: unknown = JSON.parse(readFileSync(file, "utf8"));
  return isRecord(sizes) && isCompareSizes(sizes["apps"]) ? sizes["apps"] : null;
}

/** Measures a checkout that is installed and built. */
export function measure(root: string): Snapshot {
  return { tables: measureTables(root), limits: measureLimits(root), compare: readCompare(root) };
}

function readSnapshot(file: string): Snapshot {
  const snapshot: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!isSnapshot(snapshot)) throw new Error(`${file} is not a size snapshot.`);
  return snapshot;
}

function main(args: readonly string[]): void {
  const { positionals, values } = parseArgs({
    args: [...args],
    allowPositionals: true,
    options: { root: { type: "string" }, base: { type: "string" }, sha: { type: "string" } },
  });
  const [command, ...files] = positionals;
  if (command === "measure") {
    const root = resolve(values.root ?? dirname(dirname(fileURLToPath(import.meta.url))));
    console.log(JSON.stringify(measure(root), null, 2));
  } else if (command === "compare") {
    const [baseFile, headFile] = files;
    if (baseFile === undefined || headFile === undefined) throw new Error("Pass the base and head snapshots.");
    const base = existsSync(baseFile) ? readSnapshot(baseFile) : null;
    process.stdout.write(report(base, readSnapshot(headFile), { base: values.base ?? "main", sha: values.sha ?? "HEAD" }));
  } else {
    throw new Error("Pass `measure` or `compare`.");
  }
}

// Tests import this file for its functions, so only a direct run does the work.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
