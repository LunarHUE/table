import {
  cellKey,
  createTableStore,
  type AnyTableDef,
  type ColumnPipelineResult,
  type ColumnView,
  type FeatureFactoryLike,
  type HeaderGroup,
  type KeyedScope,
  type RowOf,
  type RequestOf,
  type StateOf,
  type Table,
  type TableRowsOptions,
  type TableRowsView,
  type TableStore,
  type TableStoreOptions,
} from "@lunarhue/table-core";
import { isServer } from "@solidjs/web";
import { createEffect, createMemo, createSignal, getOwner, onCleanup, runWithOwner, untrack, type Accessor, type Signal } from "solid-js";
import {
  isStateful,
  keyedReader,
  keyedScope,
  nameOf,
  nothing,
  reader,
  selected,
  storeOf,
  type AnyTable,
  type FeatureKey,
  type Key,
  type Store,
} from "./store.js";

type Meta = Readonly<Record<string, unknown>>;

const metaSignals = new WeakMap<Store, Signal<Meta>>();

/** The signal that holds a table's `meta`. The store doesn't announce meta, so `createTable` sets it. */
const metaSignal = (store: Store): Signal<Meta> => {
  let signal = metaSignals.get(store);
  if (!signal) {
    // One signal per store, owned by no component, so it outlives the first reader.
    signal = runWithOwner(null, () => createSignal<Meta>(store.meta, { ownedWrite: true }));
    metaSignals.set(store, signal);
  }
  return signal;
};

/** True when two meta objects have the same keys with the same values. */
const sameMeta = (a: Meta, b: Meta): boolean => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && Object.is(a[key], b[key]));
};

const noColumns: readonly string[] = Object.freeze([]);

/** What `createTable` takes: options, or an accessor of them, read in an effect after the table is made. */
export type CreateTableOptions<TDef extends AnyTableDef> = TableStoreOptions<TDef> | Accessor<TableStoreOptions<TDef> | undefined>;

/**
 * Makes the table for a definition, once. It holds no Solid state: read
 * state with the other primitives.
 *
 * `options` may be an accessor, or an object with getters such as a
 * component's props. An effect reads it, and each time it changes hands the
 * table the new `bind` (controlled slices only: each slice keeps its owner
 * for the table's life), `omitColumns` (leaving it out shows every column
 * again) and `meta`, then wakes the readers. On the server, and with no
 * owner, the table takes the first options only.
 */
export function createTable<TDef extends AnyTableDef>(def: TDef, options?: CreateTableOptions<TDef>): TableStore<TDef> {
  const resolve = typeof options === "function" ? options : () => options;
  const table = createTableStore(def, untrack(resolve));
  if (isServer || getOwner() === null || options === undefined) return table;
  const store = storeOf(table);
  createEffect(
    () => {
      const next = resolve();
      // Each read tracks, so a getter in `options` is followed as an accessor is.
      return { bind: next?.bind, omitColumns: next?.omitColumns ?? noColumns, meta: next?.meta };
    },
    (next) => {
      const meta = next.meta ?? {};
      const [current, setMeta] = metaSignal(store);
      const metaChanged = !sameMeta(untrack(current), meta);
      table.updateOptions({
        omitColumns: next.omitColumns,
        ...(next.bind === undefined ? {} : { bind: next.bind }),
        ...(metaChanged ? { meta } : {}),
      });
      table.flush();
      if (metaChanged) setMeta(() => store.meta);
    },
    { defer: true },
  );
  return table;
}

/** The table's `meta`, following the options `createTable` reads. */
export function createTableMeta(table: AnyTable): Accessor<Meta> {
  const store = storeOf(table);
  if (isServer) return () => store.meta;
  return metaSignal(store)[0];
}

/** `options` with the page size from pagination's state, when the table has pagination and `options` gives none. */
const withPageSize = (store: Store, options: TableRowsOptions | undefined): TableRowsOptions | undefined => {
  if (options?.pageSize !== undefined || !isStateful(store, "pagination")) return options;
  const state = store.getFeatureState("pagination");
  const pageSize = typeof state === "object" && state !== null && "pageSize" in state ? state.pageSize : undefined;
  return typeof pageSize === "number" ? { ...options, pageSize } : options;
};

/** The ids of the columns the app didn't omit, which is all the row stages see of the columns. */
const columnIds = (store: Store): ReadonlySet<string> => new Set(store.getColumns().allColumns.map((column) => column.id));

const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * Subscribes to what the rows depend on: the slices the row stages read,
 * pagination's slice for the page size, the omitted columns, and, with
 * `withRequest`, the request. Writes to anything else, such as selection or
 * column visibility, call nothing.
 */
function subscribeRows(store: Store, withRequest: boolean, listener: () => void): () => void {
  const names = new Set<string>(["pagination"]);
  for (const feature of store.def.resolvedFeatures.ordered) {
    const stage = feature.def.rowStage;
    if (!stage) continue;
    names.add(feature.name);
    for (const name of stage.reads ?? []) names.add(name);
  }
  const offs = [...names].filter((name) => isStateful(store, name)).map((name) => store.subscribeFeature(name, listener));
  let ids = columnIds(store);
  offs.push(
    store.subscribeColumns(() => {
      const next = columnIds(store);
      if (sameIds(next, ids)) return;
      ids = next;
      listener();
    }),
  );
  if (withRequest) offs.push(store.subscribeRequest(listener));
  return () => offs.forEach((off) => off());
}

/** What `createTableRows` takes besides the data: options, or an accessor of them. */
export type RowsOptions = TableRowsOptions | Accessor<TableRowsOptions | undefined>;

/**
 * The rows to show for `data`, with their counts, as a memo. The data stays
 * with the app, outside the table. The memo runs again only when the data,
 * the options or a slice a row stage reads changes: a write the row stages
 * don't read, such as a selection or column visibility change, doesn't run
 * it. With pagination installed, the page size comes from the table's state
 * unless the options give one, so `pageCount` is set.
 */
export function createTableRows<TRow>(
  table: Table<TRow>,
  data: Accessor<readonly NoInfer<TRow>[]>,
  options?: RowsOptions,
): Accessor<TableRowsView<TRow>> {
  const store = storeOf(table);
  const resolve = typeof options === "function" ? options : () => options;
  // The store computes rows from the data it's given, which is `TRow[]`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const compute = () => store.computeRows(data(), withPageSize(store, resolve())) as TableRowsView<TRow>;
  if (isServer || getOwner() === null) return compute;
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  const bump = () => setVersion((n) => n + 1);
  const withRequest = createMemo(() => resolve()?.requestKey !== undefined);
  const subscribed = createMemo(() => {
    onCleanup(subscribeRows(store, withRequest(), bump));
    return true;
  });
  return createMemo(() => {
    subscribed();
    version();
    return compute();
  });
}

/**
 * What to send the server: the request of each installed feature with a
 * `request` seam, by name. It is the same object until a value in it
 * changes, so it can key a fetch.
 */
export function createTableRequest<TDef extends AnyTableDef>(table: Table<RowOf<TDef>, readonly [], TDef>): Accessor<RequestOf<TDef>> {
  const store = storeOf(table);
  // The store makes the request from the definition's features.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return reader(store.getRequest, store.getServerRequest, store.subscribeRequest) as Accessor<RequestOf<TDef>>;
}

const columnsOf = (table: AnyTable): Accessor<ColumnPipelineResult<unknown>> => {
  const store = storeOf(table);
  return reader(store.getColumns, store.getServerColumns, store.subscribeColumns);
};

const pickHeaderGroups = (columns: ColumnPipelineResult<unknown>) => columns.headerGroups;
const pickVisible = (columns: ColumnPipelineResult<unknown>) => columns.visibleColumns;
const pickAll = (columns: ColumnPipelineResult<unknown>) => columns.allColumns;

/** The header rows over the shown columns. Changes when columns are hidden, moved or omitted. */
export function createHeaderGroups<TRow>(table: Table<TRow>): Accessor<readonly HeaderGroup<TRow>[]> {
  // The columns are the definition's, of rows `TRow`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return selected(columnsOf(table), pickHeaderGroups) as Accessor<readonly HeaderGroup<TRow>[]>;
}

/** The shown columns, start zone first. */
export function createVisibleColumns<TRow>(table: Table<TRow>): Accessor<readonly ColumnView<TRow>[]> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return selected(columnsOf(table), pickVisible) as Accessor<readonly ColumnView<TRow>[]>;
}

/** Every column the app didn't omit, shown or hidden, as a column menu lists them. */
export function createAllColumns<TRow>(table: Table<TRow>): Accessor<readonly ColumnView<TRow>[]> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return selected(columnsOf(table), pickAll) as Accessor<readonly ColumnView<TRow>[]>;
}

/**
 * One feature's state. Typed when the table's definition is known and has
 * the feature. A table without it, as a generic component may get, gives an
 * accessor of `undefined` that never changes.
 */
export function createFeatureState<TDef extends AnyTableDef, K extends keyof StateOf<TDef> & string>(
  table: Table<RowOf<TDef>, readonly [], TDef>,
  name: K | FeatureFactoryLike<K>,
): Accessor<StateOf<TDef>[K]>;
export function createFeatureState(table: AnyTable, name: FeatureKey): Accessor<unknown>;
export function createFeatureState(table: AnyTable, feature: FeatureKey): Accessor<unknown> {
  const store = storeOf(table);
  const name = nameOf(feature);
  if (!isStateful(store, name)) return nothing;
  return reader(
    () => store.getFeatureState(name),
    () => store.getServerFeatureState(name),
    (listener) => store.subscribeFeature(name, listener),
  );
}

const same = (part: unknown): unknown => part;

/** The part of a keyed feature's state for one key, picked by `select`. */
function keyedState(table: AnyTable, scope: KeyedScope, feature: FeatureKey, key: Key, select: (part: unknown) => unknown): Accessor<unknown> {
  const store = storeOf(table);
  const name = nameOf(feature);
  if (keyedScope(store, name) !== scope) return selected<undefined, unknown>(nothing, select);
  const part = keyedReader(key, (k) =>
    reader(
      () => store.getKeyedState(name, k),
      () => store.getServerKeyedState(name, k),
      (listener) => store.subscribeKeyed(name, k, listener),
    ),
  );
  return select === same ? part : selected(part, select);
}

/**
 * The part of a row-keyed feature's state for one row, such as whether
 * selection has it. Only a write that changes this row's part wakes the
 * accessor's readers. `rowId` may be an accessor; the subscription follows
 * it. A feature the table lacks, or one not keyed by row, gives `undefined`.
 */
export function createRowState(table: AnyTable, rowId: Key, feature: FeatureKey): Accessor<unknown>;
export function createRowState<T>(table: AnyTable, rowId: Key, feature: FeatureKey, select: (part: unknown) => T): Accessor<T>;
export function createRowState(table: AnyTable, rowId: Key, feature: FeatureKey, select: (part: unknown) => unknown = same): Accessor<unknown> {
  return keyedState(table, "row", feature, rowId, select);
}

/** As `createRowState`, for a column-keyed feature such as sorting: `createColumnState(table, "name", sorting)` gives the column's direction. */
export function createColumnState(table: AnyTable, columnId: Key, feature: FeatureKey): Accessor<unknown>;
export function createColumnState<T>(table: AnyTable, columnId: Key, feature: FeatureKey, select: (part: unknown) => T): Accessor<T>;
export function createColumnState(
  table: AnyTable,
  columnId: Key,
  feature: FeatureKey,
  select: (part: unknown) => unknown = same,
): Accessor<unknown> {
  return keyedState(table, "column", feature, columnId, select);
}

const valueOf = (key: Key): string => (typeof key === "string" ? key : key());

/** As `createRowState`, for a cell-keyed feature. */
export function createCellState(table: AnyTable, rowId: Key, columnId: Key, feature: FeatureKey): Accessor<unknown>;
export function createCellState<T>(
  table: AnyTable,
  rowId: Key,
  columnId: Key,
  feature: FeatureKey,
  select: (part: unknown) => T,
): Accessor<T>;
export function createCellState(
  table: AnyTable,
  rowId: Key,
  columnId: Key,
  feature: FeatureKey,
  select: (part: unknown) => unknown = same,
): Accessor<unknown> {
  const key = typeof rowId === "string" && typeof columnId === "string" ? cellKey(rowId, columnId) : () => cellKey(valueOf(rowId), valueOf(columnId));
  return keyedState(table, "cell", feature, key, select);
}
