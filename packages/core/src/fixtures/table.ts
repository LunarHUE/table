import { cellKey } from "../cells.js";
import type { RowLike, SortableColumnId } from "../contract.js";
import { defineTable } from "../define-table.js";
import { defineFeature } from "../feature.js";

// Features and a table for the store tests. They stand in for the built-in
// features, which live outside core and plug in through the same seams.

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
}

export const users: readonly User[] = [
  { id: "a", name: "Ada", email: "ada@example.com", age: 36 },
  { id: "b", name: "Bob", email: "bob@example.com", age: 41 },
  { id: "c", name: "Cara", email: "cara@example.com", age: 29 },
  { id: "d", name: "Dan", email: "dan@example.com", age: 52 },
];
const byId = new Map(users.map((user) => [user.id, user]));
const nameOf = (row: RowLike) => byId.get(row.id)?.name ?? "";

/** How often each row stage ran. Tests reset it. */
export const stageRuns = { filter: 0, sort: 0, window: 0 };
/** What the seams saw last: the column ids the filter stage got, and the sources of rows effects pagination got. */
export const seen = { columns: [] as readonly string[], sources: [] as string[] };

export interface SortEntry {
  readonly id: SortableColumnId;
  readonly desc: boolean;
}

export const sorting = defineFeature({
  name: "sorting",
  state: { initial: [] as readonly SortEntry[] },
  api: (ctx) => ({ sortBy: (id: string, desc = false) => ctx.setState([{ id, desc }]) }),
  rowStage: {
    phase: "sort",
    run: (rows, ctx) => {
      stageRuns.sort++;
      const entry = ctx.state[0];
      if (!entry) return rows;
      const sign = entry.desc ? -1 : 1;
      // `toSorted` is newer than the ES2020 lib, and the spread made a copy to sort.
      // oxlint-disable-next-line unicorn/no-array-sort
      return [...rows].sort((a, b) => sign * nameOf(a).localeCompare(nameOf(b)));
    },
  },
  request: (state) => ({ sort: state.map((entry) => `${entry.desc ? "-" : ""}${entry.id}`) }),
});

export const filtering = defineFeature({
  name: "filtering",
  state: { initial: { query: "" }, rowsEffect: "matching" },
  api: (ctx) => ({
    setQuery: (query: string) => ctx.setState({ query }),
    /** Writes without resetting other features. */
    setQuietly: (query: string) => ctx.setState({ query }, { rowsEffect: "none" }),
  }),
  rowStage: {
    phase: "filter",
    run: (rows, ctx) => {
      stageRuns.filter++;
      seen.columns = ctx.columns.map((column) => column.id);
      const query = ctx.state.query.toLowerCase();
      return rows.filter((row) => nameOf(row).toLowerCase().includes(query));
    },
  },
  request: (state) => ({ query: state.query }),
});

export interface PageState {
  readonly pageIndex: number;
  readonly pageSize: number;
}

const firstPage: PageState = { pageIndex: 0, pageSize: 2 };

export const pagination = defineFeature({
  name: "pagination",
  state: {
    initial: firstPage,
    onRowsEffect: (effect, state, ctx) => {
      seen.sources.push(`${effect}:${ctx.source}`);
      return effect === "matching" && state.pageIndex !== 0 ? { ...state, pageIndex: 0 } : state;
    },
  },
  api: (ctx) => ({ setPage: (pageIndex: number) => ctx.setState((prev) => ({ ...prev, pageIndex })) }),
  rowStage: {
    phase: "window",
    run: (rows, ctx) => {
      stageRuns.window++;
      const { pageIndex, pageSize } = ctx.state;
      return rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    },
  },
});

const noneSelected: Readonly<Record<string, boolean>> = {};

export const selection = defineFeature({
  name: "selection",
  state: {
    initial: noneSelected,
    keyed: "row",
    keyedRead: (state, key) => state[key] === true,
    rowsEffect: "none",
    onRowsEffect: (effect, state) => (effect === "matching" ? noneSelected : state),
  },
  api: (ctx) => ({ toggle: (id: string) => ctx.setState((prev) => ({ ...prev, [id]: prev[id] !== true })) }),
});

export const visibility = defineFeature({
  name: "visibility",
  state: {
    initial: [] as readonly string[],
    rowsEffect: "none",
    normalize: (hidden, columns) => {
      const known = new Set(columns.map((column) => column.id));
      return hidden.every((id) => known.has(id)) ? hidden : hidden.filter((id) => known.has(id));
    },
  },
  api: (ctx) => ({ hide: (id: string) => ctx.setState((prev) => [...prev, id]) }),
  columnStage: (columns, hidden) => columns.map((column) => (hidden.includes(column.id) ? { ...column, visible: false } : column)),
});

const noWidths: Readonly<Record<string, number>> = {};

export const widths = defineFeature({
  name: "widths",
  state: { initial: noWidths, keyed: "column", keyedRead: (state, key) => state[key], rowsEffect: "none" },
  api: (ctx) => ({ setWidth: (id: string, width: number) => ctx.setState((prev) => ({ ...prev, [id]: width })) }),
});

const noEdits: Readonly<Record<string, string>> = {};

export const edits = defineFeature({
  name: "edits",
  state: { initial: noEdits, keyed: "cell", keyedRead: (state, key) => state[key], rowsEffect: "none" },
  api: (ctx) => ({
    edit: (rowId: string, columnId: string, value: string) => ctx.setState((prev) => ({ ...prev, [cellKey(rowId, columnId)]: value })),
  }),
});

export const makeDef = () =>
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name", { sortable: true }), col.key("email"), col.key("age", { sortable: true })],
    features: [sorting(), filtering(), pagination(), selection(), visibility(), widths(), edits()],
  });
