// The ./mini entry: one hook for a small client table, on plain React state.
// It never imports core or the adapter's store, so it stays a few hundred
// bytes. A table that needs server data, URL state or column features moves
// to the main entry.
import { useMemo, useState } from "react";

export { useTableId } from "./use-table-id.js";

/** A column of a simple table. */
export interface SimpleColumn<TRow, TId extends string = string> {
  readonly id: TId;
  readonly label?: string;
  /** The cell's value: a key of the row, or a function of it. Defaults to the row's `id` key. */
  readonly accessor?: (keyof TRow & string) | ((row: TRow) => unknown);
  readonly sortable?: boolean;
  /** Orders two rows ascending. Defaults to comparing the column's values. */
  readonly compare?: (a: TRow, b: TRow) => number;
}

/** The sort of a simple table: one column, or none. */
export type SimpleSort = { readonly id: string; readonly desc: boolean } | null;

/** What `useSimpleTable` takes. */
export interface SimpleTableOptions<TRow> {
  readonly data: readonly TRow[];
  readonly columns: readonly SimpleColumn<TRow>[];
  /** Defaults to the row's `id` when it is a string or number, else its index. */
  readonly getRowId?: (row: TRow, index: number) => string;
  readonly initialSort?: SimpleSort;
  /** Whether a row matches the search. Defaults to a case-insensitive match on each column's text or number. */
  readonly filter?: (row: TRow, query: string) => boolean;
  readonly initialSearch?: string;
  /** Rows per page. Leave it out to show every row. */
  readonly pageSize?: number;
  /** Turns on row selection. Without it the selection commands do nothing. */
  readonly selectable?: boolean;
}

/** A row on the current page. */
export interface SimpleRow<TRow> {
  readonly id: string;
  readonly original: TRow;
}

/** What `useSimpleTable` returns. Commands that take no value ignore their arguments. */
export interface SimpleTable<TRow> {
  /** The rows on the current page, filtered and sorted. */
  readonly rows: readonly SimpleRow<TRow>[];
  readonly columns: readonly SimpleColumn<TRow>[];
  /** The value of a column for a row, as search and the default sort see it. */
  readonly getValue: (row: TRow, columnId: string) => unknown;
  /** Rows that match the search, on every page. */
  readonly filteredCount: number;
  readonly totalCount: number;

  readonly sort: SimpleSort;
  /** A column's direction, the shape `ariaSort` from ./a11y takes. */
  readonly sortDir: (columnId: string) => "asc" | "desc" | false;
  /** Cycles a column through ascending, descending and unsorted, and goes back to the first page. */
  readonly toggleSort: (columnId: string) => void;
  readonly setSort: (sort: SimpleSort) => void;

  readonly search: string;
  /** Sets the search and goes back to the first page. */
  readonly setSearch: (query: string) => void;

  readonly pageIndex: number;
  /** `undefined` when every row is on one page. */
  readonly pageSize: number | undefined;
  readonly pageCount: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly next: () => void;
  readonly prev: () => void;
  readonly setPage: (index: number) => void;
  /** Sets rows per page, or `undefined` for one page, and goes back to the first page. */
  readonly setPageSize: (size: number | undefined) => void;

  readonly selectedIds: readonly string[];
  readonly isSelected: (id: string) => boolean;
  readonly toggleRow: (id: string) => void;
  /** Selects every row that matches the search, or clears them when all are selected. */
  readonly toggleAll: () => void;
  readonly clearSelection: () => void;
  /** Every matching row is selected, and there is at least one. */
  readonly allSelected: boolean;
  /** Some matching rows are selected but not all. */
  readonly indeterminate: boolean;
}

const none: readonly string[] = [];

const defaultId = (row: unknown, index: number): string => {
  const id: unknown = typeof row === "object" && row !== null ? Reflect.get(row, "id") : undefined;
  return typeof id === "string" || typeof id === "number" ? String(id) : String(index);
};

const valueOf = <TRow>(columns: readonly SimpleColumn<TRow>[], row: TRow, columnId: string): unknown => {
  const accessor = columns.find((column) => column.id === columnId)?.accessor ?? columnId;
  if (typeof accessor === "function") return accessor(row);
  return typeof row === "object" && row !== null ? Reflect.get(row, accessor) : undefined;
};

const compareValues = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b), undefined, { numeric: true });
};

/**
 * A client table in one hook: sort by one column, search, pages and row
 * selection, all on React state. Changing the sort or the search goes back
 * to the first page. Every value it returns is new when something changed
 * and frozen in shape, so it can go straight into props.
 */
export function useSimpleTable<TRow>(options: SimpleTableOptions<TRow>): SimpleTable<TRow> {
  const { data, columns, filter } = options;
  const getRowId = options.getRowId ?? defaultId;
  const selectable = options.selectable === true;
  const [sort, setSortState] = useState<SimpleSort>(options.initialSort ?? null);
  const [search, setSearchState] = useState(options.initialSearch ?? "");
  const [page, setPageState] = useState(0);
  const [pageSize, setPageSizeState] = useState(options.pageSize);
  const [selectedIds, setSelected] = useState(none);

  const getValue = (row: TRow, columnId: string): unknown => valueOf(columns, row, columnId);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const all = data.map((original, index): SimpleRow<TRow> => ({ id: getRowId(original, index), original }));
    const matches = query === "" ? all : all.filter(({ original }) =>
      filter
        ? filter(original, query)
        : columns.some((column) => {
            const value = valueOf(columns, original, column.id);
            return (typeof value === "string" || typeof value === "number") && String(value).toLowerCase().includes(query);
          }),
    );
    const column = sort && columns.find((c) => c.id === sort.id);
    if (!sort || !column) return matches;
    const dir = sort.desc ? -1 : 1;
    // A copy, so `toSorted` (ES2023) isn't needed.
    // oxlint-disable-next-line unicorn/no-array-sort
    return [...matches].sort(({ original: a }, { original: b }) => {
      if (column.compare) return dir * column.compare(a, b);
      const x = valueOf(columns, a, column.id);
      const y = valueOf(columns, b, column.id);
      // Empty values go last in both directions.
      if (x === null || x === undefined || y === null || y === undefined) return (x ?? null) === null ? ((y ?? null) === null ? 0 : 1) : -1;
      return dir * compareValues(x, y);
    });
  }, [data, columns, getRowId, filter, search, sort]);

  const filteredCount = filtered.length;
  const pageCount = pageSize ? Math.max(1, Math.ceil(filteredCount / pageSize)) : 1;
  // Clamped here and not in state, so the page follows when rows go away.
  const pageIndex = Math.min(page, pageCount - 1);
  const rows = pageSize ? filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize) : filtered;

  const selected = new Set(selectedIds);
  const selectedCount = filtered.filter((row) => selected.has(row.id)).length;
  const allSelected = filteredCount > 0 && selectedCount === filteredCount;

  const setSort = (next: SimpleSort): void => {
    setSortState(next);
    setPageState(0);
  };
  const setPage = (index: number): void => setPageState(Math.max(0, Math.min(Math.trunc(index), pageCount - 1)));
  const select = (next: (ids: readonly string[]) => readonly string[]): void => {
    if (selectable) setSelected(next);
  };
  const sortDir = (id: string): "asc" | "desc" | false => (sort?.id === id ? (sort.desc ? "desc" : "asc") : false);

  return {
    rows,
    columns,
    getValue,
    filteredCount,
    totalCount: data.length,
    sort,
    sortDir,
    setSort,
    toggleSort: (id) => {
      const dir = sortDir(id);
      setSort(dir === "desc" ? null : { id, desc: dir === "asc" });
    },
    search,
    setSearch: (query) => {
      setSearchState(query);
      setPageState(0);
    },
    pageIndex,
    pageSize,
    pageCount,
    canPrev: pageIndex > 0,
    canNext: pageIndex + 1 < pageCount,
    next: () => setPage(pageIndex + 1),
    prev: () => setPage(pageIndex - 1),
    setPage,
    setPageSize: (size) => {
      setPageSizeState(size);
      setPageState(0);
    },
    selectedIds,
    isSelected: (id) => selected.has(id),
    toggleRow: (id) => select((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])),
    toggleAll: () => {
      const ids = new Set(filtered.map((row) => row.id));
      select((current) => (allSelected ? current.filter((id) => !ids.has(id)) : [...current, ...[...ids].filter((id) => !current.includes(id))]));
    },
    clearSelection: () => select(() => none),
    allSelected,
    indeterminate: selectedCount > 0 && !allSelected,
  };
}
