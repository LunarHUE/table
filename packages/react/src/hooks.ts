import {
  cellKey,
  createTableStore,
  type AnyTableDef,
  type ColumnView,
  type FeatureFactoryLike,
  type HeaderGroup,
  type RequestOf,
  type RowOf,
  type StateOf,
  type Table,
  type TableRowsOptions,
  type TableRowsView,
  type TableStore,
  type TableStoreOptions,
} from "@lunarhue/table-core";
import { useEffect, useLayoutEffect, useState } from "react";
import { useSyncExternalStore } from "#lunarhue/react";
import { useSelected, useSource } from "./select.js";
import {
  columnsSource,
  featureSource,
  isStateful,
  keyedSource,
  metaSource,
  requestSource,
  rowsSubscribe,
  storeOf,
  type AnyTable,
  type Store,
} from "./sources.js";

/** `useLayoutEffect` in the browser and `useEffect` on the server, where React before 18 warns about layout effects. */
const useCommitEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

const noColumns: readonly string[] = Object.freeze([]);
const noMeta: Readonly<Record<string, unknown>> = Object.freeze({});

/** True when two meta objects have the same keys with the same values. */
const sameMeta = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && Object.is(a[key], b[key]));
};

/**
 * Hands a render's options to the store once the render commits, then wakes
 * the listeners the change queued. Meta goes over only when a value in it
 * changed, so an inline `meta` object doesn't give every cell a new `meta`.
 */
function sync(store: Store, options: TableStoreOptions<AnyTableDef>, meta: Readonly<Record<string, unknown>>): void {
  const metaChanged = !sameMeta(store.meta, meta);
  store.updateOptions(metaChanged ? { ...options, meta } : options);
  store.flush();
  if (metaChanged) metaSource(store).notify();
}

/**
 * Makes the table for a definition on the first render and returns the same
 * handle on every render after, so children that take it never re-render
 * because state changed. It holds no state: read state with the other hooks.
 *
 * `options` is read every render. After each commit the table takes the
 * render's `bind` (controlled slices only: each slice keeps its owner for
 * the table's life), `omitColumns` (leaving it out shows every column
 * again) and `meta`. Components below that read the table re-render in the
 * same commit, before the browser paints. A later render with a different
 * definition, as a hot reload passes, makes a new table from it.
 */
export function useTable<TDef extends AnyTableDef>(def: TDef, options?: TableStoreOptions<TDef>): TableStore<TDef> {
  const [table, setTable] = useState(() => createTableStore(def, options));
  if (table.def !== def) setTable(createTableStore(def, options));
  const store = storeOf(table);
  const bind = options?.bind;
  const omitColumns = options?.omitColumns ?? noColumns;
  const meta = options?.meta ?? noMeta;
  useCommitEffect(() => {
    // The bindings are typed for this table's state, which the store takes untyped.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    sync(store, bind === undefined ? { omitColumns } : { bind: bind as object, omitColumns }, meta);
  }, [store, bind, omitColumns, meta]);
  return table;
}

/** The app's data, typed by the table and not inferred from the data. */
type RowsOf<TRow> = readonly NoInfer<TRow>[];

/** `options` with the page size from pagination's state, when the table has pagination and `options` gives none. */
const withPageSize = (store: Store, options: TableRowsOptions | undefined): TableRowsOptions | undefined => {
  if (options?.pageSize !== undefined || !isStateful(store, "pagination")) return options;
  const state = store.getFeatureState("pagination");
  const pageSize = typeof state === "object" && state !== null && "pageSize" in state ? state.pageSize : undefined;
  return typeof pageSize === "number" ? { ...options, pageSize } : options;
};

/**
 * The rows to show for `data`, with their counts. The data stays with the
 * app, outside the table. The hook re-renders only when the rows or counts
 * change: a write the row stages don't read, such as a selection or column
 * visibility change, doesn't wake it. With pagination installed, the page
 * size comes from the table's state unless `options.pageSize` gives one, so
 * `pageCount` is set.
 */
export function useTableRows<TRow>(table: Table<TRow>, data: RowsOf<TRow>, options?: TableRowsOptions): TableRowsView<TRow> {
  const store = storeOf(table);
  const subscribe = rowsSubscribe(store, options?.requestKey !== undefined);
  const get = () => store.computeRows(data, withPageSize(store, options));
  const view = useSyncExternalStore(subscribe, get, get);
  // The store computes rows from the data it's given, which is `TRow[]`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return view as TableRowsView<TRow>;
}

/**
 * What to send the server: the request of each installed feature with a
 * `request` seam, by name. It is the same object until a value in it
 * changes, so it can go in an effect's dependencies or a fetch cache key.
 */
export function useTableRequest<TDef extends AnyTableDef>(table: Table<RowOf<TDef>, readonly [], TDef>): RequestOf<TDef> {
  // The store makes the request from the definition's features.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return useSource(requestSource(storeOf(table))) as RequestOf<TDef>;
}

const pickHeaderGroups = (columns: { readonly headerGroups: readonly HeaderGroup[] }) => columns.headerGroups;
const pickVisible = (columns: { readonly visibleColumns: readonly ColumnView[] }) => columns.visibleColumns;
const pickAll = (columns: { readonly allColumns: readonly ColumnView[] }) => columns.allColumns;

/** The header rows over the shown columns. Re-renders when columns are hidden, moved or omitted. */
export function useHeaderGroups<TRow>(table: Table<TRow>): readonly HeaderGroup<TRow>[] {
  // The columns are the definition's, of rows `TRow`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return useSelected(columnsSource(storeOf(table)), pickHeaderGroups) as readonly HeaderGroup<TRow>[];
}

/** The shown columns, start zone first. */
export function useVisibleColumns<TRow>(table: Table<TRow>): readonly ColumnView<TRow>[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return useSelected(columnsSource(storeOf(table)), pickVisible) as readonly ColumnView<TRow>[];
}

/** Every column the app didn't omit, shown or hidden, as a column menu lists them. */
export function useAllColumns<TRow>(table: Table<TRow>): readonly ColumnView<TRow>[] {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return useSelected(columnsSource(storeOf(table)), pickAll) as readonly ColumnView<TRow>[];
}

/** A feature as the hooks name it: its name, or its factory. */
export type FeatureKey = string | FeatureFactoryLike;

const nameOf = (feature: FeatureKey): string => (typeof feature === "string" ? feature : feature.featureName);

/**
 * One feature's state. Typed when the table's definition is known and has
 * the feature. A table without it, as a generic component may get, gives
 * `undefined` and never re-renders.
 */
export function useFeatureState<TDef extends AnyTableDef, K extends keyof StateOf<TDef> & string>(
  table: Table<RowOf<TDef>, readonly [], TDef>,
  name: K | FeatureFactoryLike<K>,
): StateOf<TDef>[K];
export function useFeatureState(table: AnyTable, name: FeatureKey): unknown;
export function useFeatureState(table: AnyTable, name: FeatureKey): unknown {
  return useSource(featureSource(storeOf(table), nameOf(name)));
}

const same = (part: unknown): unknown => part;

/**
 * The part of a row-keyed feature's state for one row, such as whether
 * selection has it. Only a write that changes this row's part re-renders the
 * component. `select` picks from the part; it may be an inline function. A
 * feature the table lacks, or one not keyed by row, gives `undefined`.
 */
export function useRowState(table: AnyTable, rowId: string, feature: FeatureKey): unknown;
export function useRowState<T>(table: AnyTable, rowId: string, feature: FeatureKey, select: (part: unknown) => T): T;
export function useRowState(table: AnyTable, rowId: string, feature: FeatureKey, select: (part: unknown) => unknown = same): unknown {
  return useSelected(keyedSource(storeOf(table), "row", nameOf(feature), rowId), select);
}

/** As `useRowState`, for a column-keyed feature such as sorting: `useColumnState(table, "name", sorting)` gives the column's direction. */
export function useColumnState(table: AnyTable, columnId: string, feature: FeatureKey): unknown;
export function useColumnState<T>(table: AnyTable, columnId: string, feature: FeatureKey, select: (part: unknown) => T): T;
export function useColumnState(
  table: AnyTable,
  columnId: string,
  feature: FeatureKey,
  select: (part: unknown) => unknown = same,
): unknown {
  return useSelected(keyedSource(storeOf(table), "column", nameOf(feature), columnId), select);
}

/** As `useRowState`, for a cell-keyed feature. */
export function useCellState(table: AnyTable, rowId: string, columnId: string, feature: FeatureKey): unknown;
export function useCellState<T>(table: AnyTable, rowId: string, columnId: string, feature: FeatureKey, select: (part: unknown) => T): T;
export function useCellState(
  table: AnyTable,
  rowId: string,
  columnId: string,
  feature: FeatureKey,
  select: (part: unknown) => unknown = same,
): unknown {
  return useSelected(keyedSource(storeOf(table), "cell", nameOf(feature), cellKey(rowId, columnId)), select);
}

/** The table's `meta`, re-rendering when `useTable` gets meta with a different value. */
export function useTableMeta(table: AnyTable): Readonly<Record<string, unknown>> {
  return useSource(metaSource(storeOf(table)));
}
