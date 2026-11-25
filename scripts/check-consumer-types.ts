// Checks that a consumer who depends only on an adapter (or core) can emit
// and type-check declarations for its own code with skipLibCheck off. Strict
// installs (pnpm, Bun isolated) don't let that consumer resolve
// `@lunarhue/table-core` when only `@lunarhue/table-react` or
// `@lunarhue/table-solid` is installed, so every type its declarations name
// must come from the adapter's bundled declarations.
//
// Build first:
//   bun run build && bun run check:consumer-types
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tsc = join(root, "node_modules", ".bin", "tsc");

interface Consumer {
  readonly name: string;
  readonly source: string;
  readonly links: Readonly<Record<string, string>>;
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
  const { bind, state } = createTableBinding(usersTable, appUrl, { input: "", onWrite: () => {} });
  const table = createTable(usersTable, () => ({ bind: bind() }));
  const view = createTableRows(table, data);
  const groups = createHeaderGroups(table);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  return { table, view, groups, columns, pager, state, Cell, Header, Footer };
}
`;

const ours = (name: string) => ({ [`@lunarhue/table-${name}`]: `packages/${name}` });

const consumers: readonly Consumer[] = [
  { name: "core", source: coreConsumer, links: ours("core") },
  {
    name: "react (without core installed)",
    source: reactConsumer,
    links: {
      ...ours("react"),
      react: "packages/react/node_modules/react",
      "@types/react": "packages/react/node_modules/@types/react",
    },
  },
  {
    name: "solid (without core installed)",
    source: solidConsumer,
    links: {
      ...ours("solid"),
      "solid-js": "packages/solid/node_modules/solid-js",
      "@solidjs/web": "packages/solid/node_modules/@solidjs/web",
    },
  },
];

const compilerOptions = {
  target: "es2022",
  lib: ["es2022", "dom"],
  module: "preserve",
  moduleResolution: "bundler",
  strict: true,
  skipLibCheck: false,
  types: [],
};

function link(dir: string, name: string, target: string): void {
  const path = join(dir, "node_modules", name);
  mkdirSync(dirname(path), { recursive: true });
  symlinkSync(target, path, "dir");
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
for (const { name, source, links } of consumers) {
  const dir = mkdtempSync(join(tmpdir(), "table-consumer-"));
  try {
    for (const [pkg, path] of Object.entries(links)) link(dir, pkg, join(root, path));
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
