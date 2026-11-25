// Checks that a consumer can emit and type-check declarations for its own code
// with skipLibCheck off. Each consumer gets a strict, pnpm-style install: our
// packages are copied into node_modules/.pnpm, and a package sees only its own
// dependencies. A consumer that installs only `@lunarhue/table-react` or
// `@lunarhue/table-solid` can't resolve `@lunarhue/table-core`, so its
// declarations must name core's types through the adapter's re-exports. A
// consumer that installs core too must get the same types from both.
//
// Build first:
//   bun run build && bun run check:consumer-types
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tsc = join(root, "node_modules", ".bin", "tsc");

type Package = "core" | "react" | "solid";

interface Consumer {
  readonly name: string;
  readonly source: string;
  /** Our packages the consumer depends on. Their peers are installed with them. */
  readonly installs: readonly Package[];
}

const coreConsumer = `
import {
  bindGroup,
  defineStateAdapter,
  defineTable,
  remoteFiltering,
  remotePagination,
  remoteSorting,
  resolveTableState,
  selection,
  type FeatureBindings,
  type RequestOf,
  type StateOf,
} from "@lunarhue/table-core";

export interface User {
  readonly id: string;
  readonly name: string;
}

export const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [col.key("name", { label: "Name", sortable: true })],
  features: [
    remoteSorting(),
    remoteFiltering({ initial: { q: "" } }),
    remotePagination({ sizes: [20, 50] }),
    selection(),
  ],
});

export const appUrl = defineStateAdapter({
  features: ["sorting", "pagination", "filtering"] as const,
  parse(raw: Readonly<Record<string, string | undefined>>) {
    return { filtering: { q: raw.q ?? "" } };
  },
  serialize(state) {
    return { q: typeof state.filtering?.q === "string" ? state.filtering.q : "" };
  },
});

export const initial = resolveTableState(usersTable);
export const resolved = appUrl.resolve(usersTable, { q: "ada" });
export type UsersState = StateOf<typeof usersTable>;
export type UsersRequest = RequestOf<typeof usersTable>;
export const group: FeatureBindings<UsersState> = bindGroup(["sorting", "pagination"] as const, {
  state: { sorting: initial.state.sorting, pagination: initial.state.pagination },
  onStateChange: () => {},
});
`;

const reactConsumer = `
import {
  Cell,
  Footer,
  Header,
  defineCell,
  defineStateAdapter,
  defineTable,
  pagination,
  selectable,
  selection,
  sorting,
  useHeaderGroups,
  usePagination,
  useTable,
  useTableBinding,
  useTableRows,
  useVisibleColumns,
  type CellApi,
  type FooterApi,
  type HeaderApi,
  type SelectionCellApi,
  type SelectionHeaderApi,
} from "@lunarhue/table-react";
import { ariaSort, selectAllInputProps, selectInputProps, useRowLink } from "@lunarhue/table-react/a11y";
import { useSimpleTable } from "@lunarhue/table-react/mini";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

export const SelectCell = defineCell(
  ({ cell }: { readonly cell: CellApi<unknown, User, SelectionCellApi> }) => {
    const props = selectInputProps({ checked: cell.selected, toggle: cell.toggleSelected, label: cell.row.id });
    return props.checked ? "x" : null;
  },
  selectable(),
);

export const SelectHeader = ({ header }: { readonly header: HeaderApi<User, SelectionHeaderApi> }) => {
  const props = selectAllInputProps({ checked: header.checked, indeterminate: header.indeterminate, toggle: header.toggle, label: "All" });
  return props.checked ? "all" : null;
};

export const ScoreFooter = ({ footer }: { readonly footer: FooterApi<number, User> }) =>
  String(footer.values.reduce((sum, n) => sum + n, 0));

export const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [
    col.custom("select", { parts: [selectable()], cell: SelectCell, header: SelectHeader }),
    col.key("name", { label: "Name", sortable: true }),
    col.key("score", { label: "Score", sortable: true, footer: ScoreFooter }),
  ],
  features: [sorting(), pagination({ sizes: [10, 25] }), selection()],
});

export const appUrl = defineStateAdapter({
  features: ["sorting", "pagination"] as const,
  parse: (_raw: string) => ({}),
  serialize: () => "",
});

export function useUsers(data: readonly User[]) {
  const { bind, isPending } = useTableBinding(usersTable, appUrl, { input: "", onWrite: () => {} });
  const table = useTable(usersTable, { bind });
  const view = useTableRows(table, data);
  const groups = useHeaderGroups(table);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  const link = useRowLink(() => {});
  const simple = useSimpleTable({ data, columns: [{ id: "name", label: "Name", sortable: true }] });
  return { table, view, groups, columns, pager, isPending, link, simple, sort: ariaSort("asc"), Cell, Header, Footer };
}
`;

const solidConsumer = `
import {
  Cell,
  Footer,
  Header,
  createHeaderGroups,
  createPagination,
  createTable,
  createTableBinding,
  createTableRows,
  createVisibleColumns,
  defineCell,
  defineStateAdapter,
  defineTable,
  pagination,
  selectable,
  selection,
  sorting,
  type CellApi,
  type FooterApi,
  type HeaderApi,
  type SelectionCellApi,
  type SelectionHeaderApi,
} from "@lunarhue/table-solid";
import { createSignal } from "solid-js";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

export const SelectCell = defineCell(
  (props: { readonly cell: CellApi<unknown, User, SelectionCellApi> }) => (props.cell.selected ? "x" : null),
  selectable(),
);

export const SelectHeader = (props: { readonly header: HeaderApi<User, SelectionHeaderApi> }) =>
  props.header.checked ? "all" : null;

export const ScoreFooter = (props: { readonly footer: FooterApi<number, User> }) =>
  String(props.footer.values.reduce((sum, n) => sum + n, 0));

export const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [
    col.custom("select", { parts: [selectable()], cell: SelectCell, header: SelectHeader }),
    col.key("name", { label: "Name", sortable: true }),
    col.key("score", { label: "Score", sortable: true, footer: ScoreFooter }),
  ],
  features: [sorting(), pagination({ sizes: [10, 25] }), selection()],
});

export const appUrl = defineStateAdapter({
  features: ["sorting", "pagination"] as const,
  parse: (_raw: string) => ({}),
  serialize: () => "",
});

export function setupUsers(data: () => readonly User[]) {
  const [page] = createSignal(0);
  const { bind, state } = createTableBinding(usersTable, appUrl, { input: "", onWrite: () => {} });
  const table = createTable(usersTable, () => ({ bind: bind() }));
  const view = createTableRows(table, data);
  const groups = createHeaderGroups(table);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  return { table, view, groups, columns, pager, state, page, Cell, Header, Footer };
}
`;

// Apps that install core next to an adapter, as the READMEs show, mix imports.
// Each core type must be the same type through both packages, or a value made
// with core's `defineStateAdapter` fails the adapter's binding with TS2345.
const mixedShared = (adapter: string) => `
import * as core from "@lunarhue/table-core";
import * as adapter from "${adapter}";

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export interface User {
  readonly id: string;
  readonly name: string;
}

export const usersTable = core.defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [col.key("name", { label: "Name", sortable: true })],
  features: [core.sorting(), core.pagination({ sizes: [10, 25] }), core.selection()],
});

export const appUrl = core.defineStateAdapter({
  features: ["sorting", "pagination"] as const,
  parse: (_raw: string) => ({}),
  serialize: () => "",
});

type UsersDef = typeof usersTable;
export const sameTypes: [
  Same<core.StateAdapter<readonly ["sorting"], string, string>, adapter.StateAdapter<readonly ["sorting"], string, string>>,
  Same<core.TableDef<User>, adapter.TableDef<User>>,
  Same<core.TableStore<UsersDef>, adapter.TableStore<UsersDef>>,
  Same<core.ExternalBinding<number>, adapter.ExternalBinding<number>>,
  Same<core.FeatureBindings<core.StateOf<UsersDef>>, adapter.FeatureBindings<adapter.StateOf<UsersDef>>>,
  Same<typeof core.defineStateAdapter, typeof adapter.defineStateAdapter>,
  Same<typeof core.defineTable, typeof adapter.defineTable>,
] = [true, true, true, true, true, true, true];

// The adapter's own copies flow into core, too.
export const adapterUrl: core.StateAdapter<readonly ["sorting", "pagination"], string, string> = adapter.defineStateAdapter({
  features: ["sorting", "pagination"] as const,
  parse: (_raw: string) => ({}),
  serialize: () => "",
});
export const initial = core.resolveTableState(usersTable);
`;

const reactMixedConsumer = `${mixedShared("@lunarhue/table-react")}
export function useUsers(data: readonly User[]) {
  const { bind } = adapter.useTableBinding(usersTable, appUrl, { input: "", onWrite: () => {} });
  const table: core.TableStore<UsersDef> = adapter.useTable(usersTable, { bind });
  const view = adapter.useTableRows(table, data);
  return { table, view };
}
`;

const solidMixedConsumer = `${mixedShared("@lunarhue/table-solid")}
import { createSignal } from "solid-js";

export function setupUsers(data: () => readonly User[]) {
  const [page] = createSignal(0);
  const { bind, state } = adapter.createTableBinding(usersTable, appUrl, { input: "", onWrite: () => {} });
  const table: core.TableStore<UsersDef> = adapter.createTable(usersTable, () => ({ bind: bind() }));
  const view = adapter.createTableRows(table, data);
  return { table, view, state, page };
}
`;

const consumers: readonly Consumer[] = [
  { name: "core", source: coreConsumer, installs: ["core"] },
  { name: "react (without core installed)", source: reactConsumer, installs: ["react"] },
  { name: "solid (without core installed)", source: solidConsumer, installs: ["solid"] },
  { name: "core + react", source: reactMixedConsumer, installs: ["core", "react"] },
  { name: "core + solid", source: solidMixedConsumer, installs: ["core", "solid"] },
];

const dependencies: Readonly<Record<Package, readonly Package[]>> = { core: [], react: ["core"], solid: ["core"] };
const peers: Readonly<Record<Package, readonly string[]>> = {
  core: [],
  react: ["react", "@types/react"],
  solid: ["solid-js", "@solidjs/web"],
};

const compilerOptions = {
  target: "es2022",
  lib: ["es2022", "dom"],
  module: "preserve",
  moduleResolution: "bundler",
  strict: true,
  skipLibCheck: false,
  types: [],
};

function link(nodeModules: string, name: string, target: string): void {
  const path = join(nodeModules, name);
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, "dir");
}

const packageName = (pkg: Package): string => `@lunarhue/table-${pkg}`;

// Lays out node_modules/.pnpm/<pkg>/node_modules with a copy of the package
// beside links to its dependencies and peers, then links the installed
// packages and their peers into the consumer's node_modules.
function install(dir: string, installs: readonly Package[]): void {
  const nodeModules = join(dir, "node_modules");
  const store = (pkg: Package) => join(nodeModules, ".pnpm", pkg, "node_modules");
  const peerPath = (pkg: Package, peer: string) => join(root, "packages", pkg, "node_modules", peer);
  for (const pkg of ["core", "react", "solid"] as const) {
    cpSync(join(root, "packages", pkg), join(store(pkg), packageName(pkg)), {
      recursive: true,
      filter: (source) => !/[\\/](node_modules|src)$/.test(source),
    });
    for (const dep of dependencies[pkg]) link(store(pkg), packageName(dep), join(store(dep), packageName(dep)));
    for (const peer of peers[pkg]) link(store(pkg), peer, peerPath(pkg, peer));
  }
  for (const pkg of installs) {
    link(nodeModules, packageName(pkg), join(store(pkg), packageName(pkg)));
    for (const peer of peers[pkg]) link(nodeModules, peer, peerPath(pkg, peer));
  }
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

function run(cwd: string, project: string): string | undefined {
  try {
    execFileSync(tsc, ["-p", project], { cwd, encoding: "utf8", stdio: "pipe" });
    return undefined;
  } catch (error) {
    const thrown = typeof error === "object" && error !== null ? error : {};
    const stdout = "stdout" in thrown ? text(thrown.stdout) : "";
    const stderr = "stderr" in thrown ? text(thrown.stderr) : "";
    return `${stdout}${stderr}`.trim() || String(error);
  }
}

let failed = false;
for (const { name, source, installs } of consumers) {
  const dir = mkdtempSync(join(tmpdir(), "table-consumer-"));
  try {
    install(dir, installs);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(join(dir, "index.ts"), source);
    writeFileSync(
      join(dir, "tsconfig.emit.json"),
      JSON.stringify({ compilerOptions: { ...compilerOptions, declaration: true, emitDeclarationOnly: true, outDir: "out" }, files: ["index.ts"] }),
    );
    writeFileSync(
      join(dir, "tsconfig.check.json"),
      JSON.stringify({ compilerOptions: { ...compilerOptions, noEmit: true }, files: ["out/index.d.ts"] }),
    );

    const emitted = run(dir, "tsconfig.emit.json");
    const checked = emitted ?? run(dir, "tsconfig.check.json");
    if (checked === undefined) {
      console.log(`${name}: ok`);
      continue;
    }
    failed = true;
    console.error(`${name}: ${emitted === undefined ? "the emitted declarations don't type-check" : "emit failed"}`);
    console.error(checked);
    if (emitted === undefined) console.error(`\nout/index.d.ts:\n${readFileSync(join(dir, "out", "index.d.ts"), "utf8")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (failed) process.exit(1);
