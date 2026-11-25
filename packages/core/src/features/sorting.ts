import type { ColumnInfo, RowLike, SortableColumnId } from "../contract.js";
import { defineFeature, type FeatureApiContext, type FeatureStateSeam, type RowStageContext } from "../feature.js";

// Sorting comes in two features with the same name, so `table.sorting`,
// `initialState.sorting` and column subscriptions read the same either way.
// `sorting()` sorts rows in the browser. `remoteSorting()` only puts the
// sort in the server request, and doesn't import the comparators, so an app
// that sorts on the server ships none of the sort code.

/** One column in the sort list. */
export interface SortEntry {
  readonly id: SortableColumnId;
  readonly desc: boolean;
}

/** The sort list. The first entry sorts first, and each later one breaks ties left by those before it. */
export type SortingState = readonly SortEntry[];

/** How a column is sorted: ascending, descending, or not at all. */
export type SortDir = "asc" | "desc" | false;

/**
 * Compares two column values. `a` and `b` are never null, undefined or
 * NaN: `sorting` places those itself, by its `nulls` option. Return a
 * negative number when `a` comes first in ascending order.
 */
export type SortComparator = (a: unknown, b: unknown, rowA: RowLike, rowB: RowLike) => number;

/** The options both sorting features take. */
export interface RemoteSortingOptions {
  /** Whether `{ multi: true }` adds to the sort list. Defaults to `true`; `false` keeps one column sorted at a time. */
  readonly multi?: boolean;
  /** Whether `toggle` goes back to unsorted after descending. Defaults to `true`; `false` cycles between ascending and descending. */
  readonly enableRemoval?: boolean;
}

/** What `sorting()` takes. */
export interface SortingOptions extends RemoteSortingOptions {
  /** Where rows with a null, undefined or NaN value go, in either direction. Defaults to `"last"`. */
  readonly nulls?: "first" | "last";
  /** Comparators by column id, in place of the built-in one. */
  readonly comparators?: Readonly<Record<string, SortComparator>>;
}

/** What `toggle` and `set` take besides the column. */
export interface SortWriteOptions {
  /** Adds the column to the sort list, or changes it there, instead of sorting by it alone. Ignored when the feature has `multi: false`. */
  readonly multi?: boolean;
}

/** The commands at `table.sorting`. */
export interface SortingApi {
  /** Moves a column to its next direction: unsorted, ascending, descending, then unsorted again. */
  toggle(this: void, id: SortableColumnId, options?: SortWriteOptions): void;
  /** Sorts by a column in a direction, or takes it out of the sort with `null`. */
  set(this: void, id: SortableColumnId, dir: "asc" | "desc" | null, options?: SortWriteOptions): void;
  replace(this: void, next: SortingState): void;
  clear(this: void): void;
}

/** How a column is sorted in `state`. */
export const getSortDir = (state: SortingState, columnId: string): SortDir => {
  const entry = state.find((item) => item.id === columnId);
  return entry ? (entry.desc ? "desc" : "asc") : false;
};

/** A column's place in the sort list, from 0, or -1 when it isn't sorted. */
export const getSortIndex = (state: SortingState, columnId: string): number => state.findIndex((item) => item.id === columnId);

/** A selector of how one column is sorted, for a column subscription. */
export const sortDir =
  (columnId: string) =>
  (state: SortingState): SortDir =>
    getSortDir(state, columnId);

const none: SortingState = Object.freeze([]);

/** `state` with column `id` sorted in `dir`, or taken out for `false`. Returns `state` itself when nothing changes. */
const withDir = (state: SortingState, id: string, dir: SortDir, multi: boolean): SortingState => {
  const index = getSortIndex(state, id);
  if (!multi) {
    if (dir === false) return state.length === 0 ? state : none;
    const only = state.length === 1 && index === 0 && state[0]?.desc === (dir === "desc");
    return only ? state : [{ id, desc: dir === "desc" }];
  }
  if (dir === false) return index === -1 ? state : state.filter((_, i) => i !== index);
  const entry = { id, desc: dir === "desc" };
  if (index === -1) return [...state, entry];
  return state[index]?.desc === entry.desc ? state : state.map((item, i) => (i === index ? entry : item));
};

/** The direction after `dir` in the toggle cycle. */
const cycle = (dir: SortDir, removable: boolean): SortDir => (dir === false ? "asc" : dir === "asc" ? "desc" : removable ? false : "asc");

const api = (ctx: FeatureApiContext<"sorting", SortingState, RemoteSortingOptions | undefined>): SortingApi => {
  const multi = (options: SortWriteOptions | undefined) => options?.multi === true && ctx.options?.multi !== false;
  const removable = ctx.options?.enableRemoval !== false;
  return {
    toggle: (id, options) =>
      ctx.setState((prev) => withDir(prev, id, cycle(getSortDir(prev, id), removable), multi(options))),
    set: (id, dir, options) => ctx.setState((prev) => withDir(prev, id, dir ?? false, multi(options))),
    replace: (state) => ctx.setState(state),
    clear: () => ctx.setState((prev) => (prev.length === 0 ? prev : none)),
  };
};

/** The state seam both features share. */
const state = (): FeatureStateSeam<SortingState, never> => ({
  initial: none,
  keyed: "column",
  keyedRead: getSortDir,
  // A new sort reorders every row, so features that hold a place in the rows, such as a page index, start over.
  rowsEffect: "matching",
  normalize: (sort, columns) => {
    const sortable = new Set(columns.filter((column) => column.sortable === true).map((column) => column.id));
    const seen = new Set<string>();
    const kept = sort.filter((entry) => {
      if (!sortable.has(entry.id) || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    });
    return kept.length === sort.length ? sort : kept;
  },
});

/** Null, undefined, NaN and invalid dates: values with no place in an order. */
const missing = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === "number" && Number.isNaN(value)) ||
  (value instanceof Date && Number.isNaN(value.getTime()));

const order = <T extends string | number | bigint>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The built-in comparator. Numbers, bigints, booleans (false first) and
 * dates compare by value. Strings compare by UTF-16 code unit, the same in
 * every locale. Values of different types order by type name, and other
 * objects tie.
 */
const compareValues: SortComparator = (a, b) => {
  const x = a instanceof Date ? a.getTime() : typeof a === "boolean" ? Number(a) : a;
  const y = b instanceof Date ? b.getTime() : typeof b === "boolean" ? Number(b) : b;
  if (typeof x === "number" && typeof y === "number") return order(x, y);
  if (typeof x === "string" && typeof y === "string") return order(x, y);
  if (typeof x === "bigint" && typeof y === "bigint") return order(x, y);
  return order(typeof a, typeof b);
};

/** The column's value reader, when it has one. `ColumnInfo` doesn't declare `getValue`; the table's columns do. */
const valueReader = (column: ColumnInfo | undefined): ((row: unknown) => unknown) => {
  const get = column && "getValue" in column ? column.getValue : undefined;
  if (typeof get !== "function") return () => undefined;
  return (row) => {
    const value: unknown = Reflect.apply(get, column, [row]);
    return value;
  };
};

interface Group {
  readonly row: RowLike;
  /** The detail rows under the row, which move with it. */
  readonly details: RowLike[];
  readonly values: readonly unknown[];
}

const sortRows = (rows: readonly RowLike[], ctx: RowStageContext<SortingState, SortingOptions | undefined>): readonly RowLike[] => {
  const { state: sort, options, columns } = ctx;
  if (sort.length === 0) return rows;
  const missingSign = options?.nulls === "first" ? -1 : 1;
  const keys = sort.map((entry) => ({
    sign: entry.desc ? -1 : 1,
    read: valueReader(columns.find((column) => column.id === entry.id)),
    compare: options?.comparators?.[entry.id] ?? compareValues,
  }));
  const lead: RowLike[] = [];
  const groups: Group[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (row.kind === "detail") (last ? last.details : lead).push(row);
    else groups.push({ row, details: [], values: keys.map((key) => key.read(row.original)) });
  }
  // `Array.prototype.sort` is stable, so rows that tie keep their order. `toSorted` is newer than the ES2020 lib.
  // oxlint-disable-next-line unicorn/no-array-sort
  groups.sort((a, b) => {
    for (const [i, key] of keys.entries()) {
      const x = a.values[i];
      const y = b.values[i];
      const xMissing = missing(x);
      const yMissing = missing(y);
      if (xMissing || yMissing) {
        if (xMissing && yMissing) continue;
        return xMissing ? missingSign : -missingSign;
      }
      const result = key.compare(x, y, a.row, b.row);
      if (result !== 0) return key.sign * result;
    }
    return 0;
  });
  const sorted = [...lead, ...groups.flatMap((group) => [group.row, ...group.details])];
  return sorted.every((row, i) => row === rows[i]) ? rows : sorted;
};

/** Sorts rows in the browser by the columns in the sort list. */
export const sorting = /* @__PURE__ */ defineFeature<"sorting", SortingOptions | undefined, SortingState, SortingApi>({
  name: "sorting",
  state: state(),
  api,
  rowStage: { phase: "sort", reads: ["sorting"], run: sortRows },
});

/** Sends the sort list to the server as `request.sorting` and leaves the rows in the order the server returns. */
export const remoteSorting = /* @__PURE__ */ defineFeature<"sorting", RemoteSortingOptions | undefined, SortingState, SortingApi, SortingState>({
  name: "sorting",
  state: state(),
  api,
  request: (sort) => sort,
});

/** The feature `sorting()` makes. */
export type SortingFeature = ReturnType<typeof sorting>;
/** The feature `remoteSorting()` makes. */
export type RemoteSortingFeature = ReturnType<typeof remoteSorting>;
