import { createStateCoordinator, type FeatureBindings, type OwnerChange } from "./bindings.js";
import { cellKey, createCell, createCells, createKeyedCells, type KeyedStore } from "./cells.js";
import { computeColumns, type ColumnPipelineResult, type ColumnStep } from "./column-pipeline.js";
import type { ColumnInfo, RowsEffect } from "./contract.js";
import type { AnyTableDef, FeaturesOf, RequestOf, RowOf, StateOf, Table } from "./define-table.js";
import type { AnyFeature, InitialState, WriteOptions } from "./feature.js";
import { problem } from "./problem.js";
import { createRowPipeline, sameList, type RowPipelineDef, type TableRowsOptions, type TableRowsView } from "./row-pipeline.js";

// The store runs a table definition: it keeps or binds each feature's state,
// makes the feature APIs, and derives columns, rows and the server request
// from the state. It subscribes to nothing until something subscribes to
// it, and lets go of every owner when the last listener leaves.

const encode = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return `[${value.map((item) => encode(item) ?? "null").join(",")}]`;
  if (value !== null && typeof value === "object") {
    const parts: string[] = [];
    // `toSorted` is newer than the ES2020 target, and `Object.keys` returns a fresh array.
    // oxlint-disable-next-line unicorn/no-array-sort
    for (const key of Object.keys(value).sort()) {
      // Only arrays and objects reach here, and an object's keys index it.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const item = encode((value as Readonly<Record<string, unknown>>)[key]);
      if (item !== undefined) parts.push(`${JSON.stringify(key)}:${item}`);
    }
    return `{${parts.join(",")}}`;
  }
  if (value === undefined || typeof value === "function" || typeof value === "symbol") return undefined;
  return JSON.stringify(value);
};

/**
 * `JSON.stringify` with object keys sorted, so equal values give equal
 * strings whatever order their keys were set in. A top-level value JSON
 * can't write, such as `undefined`, gives `"null"`.
 */
export const stableStringify = (value: unknown): string => encode(value) ?? "null";

/** What `createTableStore` and `updateOptions` take. */
export interface TableStoreOptions<TDef extends AnyTableDef> {
  /** The owners of the feature state the app keeps, by feature name. */
  readonly bind?: FeatureBindings<StateOf<TDef> & object>;
  /** Columns this user may not see, as for permissions. No feature can show them. */
  readonly omitColumns?: ReadonlySet<string> | readonly string[];
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** What a store adds to the table type. Each `getServer*` reads what a server render shows. */
export interface TableStoreMethods<TDef extends AnyTableDef> {
  /** Every feature's state, by name. The same object until a slice changes. */
  getState(this: void): StateOf<TDef>;
  getServerState(this: void): StateOf<TDef>;
  /** One feature's state. Throws `feature:unknown` for a name with no state. */
  getFeatureState<K extends keyof StateOf<TDef> & string>(this: void, name: K): StateOf<TDef>[K];
  getServerFeatureState<K extends keyof StateOf<TDef> & string>(this: void, name: K): StateOf<TDef>[K];
  subscribeFeature(this: void, name: keyof StateOf<TDef> & string, listener: () => void): () => void;
  subscribeState(this: void, listener: () => void): () => void;
  /**
   * The part of a keyed feature's state for one key: a row id, a column id
   * or a `cellKey`. Throws `feature:unknown` for a feature that isn't keyed.
   */
  getKeyedState(this: void, feature: string, key: string): unknown;
  getServerKeyedState(this: void, feature: string, key: string): unknown;
  /** Calls `listener` when the part for `key` changes, and not for other keys. */
  subscribeKeyed(this: void, feature: string, key: string, listener: () => void): () => void;
  subscribeRow(this: void, feature: string, rowId: string, listener: () => void): () => void;
  subscribeColumn(this: void, feature: string, columnId: string, listener: () => void): () => void;
  subscribeCell(this: void, feature: string, rowId: string, columnId: string, listener: () => void): () => void;
  /** The columns after the column pipeline. The same object until a column stage's state or `omitColumns` changes. */
  getColumns(this: void): ColumnPipelineResult<RowOf<TDef>>;
  getServerColumns(this: void): ColumnPipelineResult<RowOf<TDef>>;
  subscribeColumns(this: void, listener: () => void): () => void;
  /** What to send the server. The same object until `getRequestKey()` changes. */
  getRequest(this: void): RequestOf<TDef>;
  getServerRequest(this: void): RequestOf<TDef>;
  /** The request as a string, with keys sorted, for a fetch cache key. */
  getRequestKey(this: void): string;
  getServerRequestKey(this: void): string;
  subscribeRequest(this: void, listener: () => void): () => void;
  /** The rows to show for `data`. Memoized: the same data and state give the same view. */
  computeRows(this: void, data: readonly RowOf<TDef>[], options?: TableRowsOptions): TableRowsView<RowOf<TDef>>;
  /**
   * Takes new options from a render. It wakes no listeners, so it is safe to
   * call during render; call `flush` once the render commits. `bind` only
   * updates controlled slices: each slice keeps its owner for the table's life.
   */
  updateOptions(this: void, next: TableStoreOptions<TDef>): void;
  /** Runs the listeners that changes queued. */
  flush(this: void): void;
  /** Runs `fn` and holds listeners until it returns. */
  batch<T>(this: void, fn: () => T): T;
}

/** A running table: the table type, with state, subscriptions and derived views. */
export type TableStore<TDef extends AnyTableDef> = Table<RowOf<TDef>, FeaturesOf<TDef>, TDef> & TableStoreMethods<TDef>;

type Values = Readonly<Record<string, unknown>>;
/** `TableStoreOptions` with the bindings untyped. The coordinator takes any object, since every binding is optional. */
interface Options {
  readonly bind?: object;
  readonly omitColumns?: ReadonlySet<string> | readonly string[];
  readonly meta?: Readonly<Record<string, unknown>>;
}
type Read = (name: string) => unknown;

const resolve = (updater: unknown, prev: unknown): unknown =>
  // A slice whose value is itself a function can't be set with a plain value, as with React's setState.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  typeof updater === "function" ? (updater as (prev: unknown) => unknown)(prev) : updater;

/** Caches `compute` until `deps` returns a different list. */
const memo = <T>(deps: () => readonly unknown[], compute: (deps: readonly unknown[]) => T): (() => T) => {
  let cached: { readonly deps: readonly unknown[]; readonly value: T } | undefined;
  return () => {
    const next = deps();
    if (!cached || !sameList(next, cached.deps)) cached = { deps: next, value: compute(next) };
    return cached.value;
  };
};

/**
 * Makes the store for a table definition. Creating it calls each feature's
 * `api` and `normalize`, and nothing that reaches an owner of bound state.
 */
export function createTableStore<TDef extends AnyTableDef>(def: TDef, options?: TableStoreOptions<TDef>): TableStore<TDef> {
  // The store works on state by feature name with values left unknown. The
  // public types tie each name to its feature's state.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return run(def, options ?? {}) as unknown as TableStore<TDef>;
}

interface Keyed {
  readonly store: KeyedStore<string, unknown>;
  readonly read: (state: unknown, key: string) => unknown;
  count: number;
  off: (() => void) | undefined;
}

function run(def: AnyTableDef, options: Options) {
  const features = def.resolvedFeatures.ordered;
  const statefulNames = features.filter((feature) => feature.def.state).map((feature) => feature.name);
  const stateful = new Set(statefulNames);
  const columnFeatures = features.filter((feature) => feature.def.columnStage);
  const requestFeatures = features.filter((feature) => feature.def.request);

  /** Applies `normalize` to raw slice values, keeping the last result per slice so a value fixed once stays the same object. */
  const normalizer = () => {
    const cache = new Map<string, readonly [raw: unknown, value: unknown]>();
    return (name: string, raw: unknown): unknown => {
      const fix = def.resolvedFeatures.byName.get(name)?.def.state?.normalize;
      if (!fix) return raw;
      const hit = cache.get(name);
      if (hit && Object.is(hit[0], raw)) return hit[1];
      const value = fix(raw, def.columns);
      cache.set(name, [raw, value]);
      return value;
    };
  };
  const normalize = normalizer();
  const normalizeServer = normalizer();

  // The app's `initialState` wins over the feature's own `initial`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const given = def.initialState as Values;
  const initial: Record<string, unknown> = {};
  for (const feature of features) {
    const seam = feature.def.state;
    if (!seam) continue;
    let start = given[feature.name];
    if (start === undefined) {
      // A state that is itself a function must come from the function form, so a function is always the maker.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      start = typeof seam.initial === "function" ? (seam.initial as InitialState<unknown, unknown>)(feature.options) : seam.initial;
    }
    initial[feature.name] = normalize(feature.name, start);
  }

  /**
   * Adds to `patch` each other feature's answer to a rows effect, as its
   * `onRowsEffect` gives it. When the patch already updates that feature,
   * the answer starts from the update.
   */
  const answer = (effect: RowsEffect, source: string, patch: Record<string, unknown>) => {
    for (const other of features) {
      const react = other.def.state?.onRowsEffect;
      if (!react || other.name === source) continue;
      const own = patch[other.name];
      const ctx = { options: other.options, columns: baseColumns(), source };
      patch[other.name] = (prev: unknown) => react(effect, own === undefined ? normalize(other.name, prev) : resolve(own, prev), ctx);
    }
  };

  /**
   * Answers an owner that changed its slices itself, such as the URL on a
   * back button, as the table answers its own write of them: a new filter
   * clears "all matching" and goes back to the first page. A slice counts as
   * changed only when its value reads differently, so an owner that hands
   * over a fresh but equal object changes nothing.
   */
  const onOwnerChange = (changes: readonly OwnerChange<Values>[]): Record<string, unknown> | undefined => {
    let effect: RowsEffect = "none";
    let source = "";
    for (const { feature, prev, next } of changes) {
      const own = def.resolvedFeatures.byName.get(feature)?.def.state?.rowsEffect ?? "view";
      if (own === "none" || effect === "matching" || (own === "view" && effect === "view")) continue;
      if (stableStringify(prev) === stableStringify(next)) continue;
      effect = own;
      source = feature;
    }
    if (effect === "none") return undefined;
    const patch: Record<string, unknown> = {};
    answer(effect, source, patch);
    return patch;
  };

  const cells = createCells();
  const [replace, listen] = cells;
  const coordinator = createStateCoordinator<Values>({
    initial,
    bindings: options.bind ?? {},
    cells,
    onOwnerChange,
  });
  const read: Read = (name) => normalize(name, coordinator.getSnapshot(name));
  const readServer: Read = (name) => normalizeServer(name, coordinator.getServerSnapshot(name));

  let meta = Object.freeze({ ...options.meta });
  // The cell holds the omitted ids, so a change wakes column listeners on the next flush.
  const omitCell = createCell<ReadonlySet<string>>(new Set(options.omitColumns));
  const baseColumns = memo(
    () => [omitCell.snapshot],
    (): readonly ColumnInfo[] => Object.freeze(def.columns.filter((column) => !omitCell.snapshot.has(column.id))),
  );

  /** The state, columns and request, derived from one way of reading slices. */
  const derive = (readSlice: Read) => {
    const state = memo(
      () => statefulNames.map(readSlice),
      (values) => {
        const result: Record<string, unknown> = {};
        statefulNames.forEach((name, i) => (result[name] = values[i]));
        return Object.freeze(result);
      },
    );
    const steps: ColumnStep[] = [];
    for (const feature of columnFeatures) {
      const stage = feature.def.columnStage;
      if (stage) steps.push((columns) => stage(columns, readSlice(feature.name), feature.options));
    }
    const columns = memo(
      () => [omitCell.snapshot, ...columnFeatures.map((feature) => readSlice(feature.name))],
      () => computeColumns(def.columns, omitCell.snapshot, steps),
    );
    let last: { readonly value: Values; readonly key: string } | undefined;
    const request = memo(
      () => requestFeatures.map((feature) => readSlice(feature.name)),
      (values) => {
        const value: Record<string, unknown> = {};
        requestFeatures.forEach((feature, i) => {
          const make = feature.def.request;
          if (make) value[feature.name] = make(values[i], feature.options);
        });
        const key = stableStringify(value);
        if (last?.key !== key) last = { value: Object.freeze(value), key };
        return last;
      },
    );
    return { state, columns, request };
  };
  const client = derive(read);
  const server = derive(readServer);

  /**
   * Writes `updates` for `source` in one patch. Unless the write's rows
   * effect is `"none"`, every other feature with `onRowsEffect` adds its
   * update to the same patch, so each owner hears once.
   */
  const write = (source: AnyFeature, updates: Values, writeOptions: WriteOptions | undefined) => {
    const effect = writeOptions?.rowsEffect ?? source.def.state?.rowsEffect ?? "view";
    const patch: Record<string, unknown> = {};
    for (const name of Object.keys(updates)) {
      const updater = updates[name];
      patch[name] = (prev: unknown) => resolve(updater, normalize(name, prev));
    }
    if (effect !== "none") answer(effect, source.name, patch);
    coordinator.applyPatch(patch);
  };

  const apis: Record<string, unknown> = {};
  for (const feature of features) {
    const { name, def: seams } = feature;
    if (!seams.api) continue;
    apis[name] = seams.api({
      name,
      options: feature.options,
      initial: initial[name],
      getState: () => read(name),
      setState: (updater, writeOptions) => write(feature, { [name]: updater }, writeOptions),
      patch: (updates, writeOptions) => write(feature, updates, writeOptions),
      columns: baseColumns,
      getFeatureState: read,
    });
  }

  const keyed = new Map<string, Keyed>();
  for (const feature of features) {
    const seam = feature.def.state;
    const keyedRead = seam?.keyedRead;
    if (!seam?.keyed || !keyedRead) continue;
    const name = feature.name;
    keyed.set(name, {
      store: createKeyedCells(cells, (key) => keyedRead(read(name), key)),
      read: keyedRead,
      count: 0,
      off: undefined,
    });
  }
  const keyedOf = (name: string) => {
    const entry = keyed.get(name);
    if (!entry) throw new Error(problem("feature:unknown", name));
    return entry;
  };
  const subscribeKeyed = (name: string, key: string, listener: () => void) => {
    const entry = keyedOf(name);
    // One slice listener per keyed feature re-reads the keys that have listeners.
    if (entry.count++ === 0) entry.off = coordinator.subscribe(name, entry.store.notifyAll);
    const unlisten = entry.store.subscribe(key, listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      unlisten();
      if (--entry.count === 0) {
        entry.off?.();
        entry.off = undefined;
      }
    };
  };

  /**
   * Calls `listener` when `value()` changes. It listens to the slices named
   * and, for columns, to the omitted ids, and checks the value each time one
   * of them changes, so a listener wakes once however many changed.
   */
  const watch = (names: readonly string[], value: () => unknown, listener: () => void, omit = false) => {
    let seen: unknown;
    const check = () => {
      const next = value();
      if (Object.is(next, seen)) return;
      seen = next;
      listener();
    };
    const offs = names.map((name) => coordinator.subscribe(name, check));
    if (omit) offs.push(listen(omitCell, check));
    // Read after subscribing: the first subscription pulls the owners' current values.
    seen = value();
    return () => offs.forEach((off) => off());
  };

  const known = (name: string) => {
    if (!stateful.has(name)) throw new Error(problem("feature:unknown", name));
    return name;
  };

  const rows = createRowPipeline(
    // `getRowId` takes the definition's row type, which the store's public types carry.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    def as unknown as RowPipelineDef<unknown>,
    read,
  );
  const requestKey = () => client.request().key;

  return Object.freeze({
    ...apis,
    def,
    featureNames: def.resolvedFeatures.featureNames,
    get meta() {
      return meta;
    },
    getState: client.state,
    getServerState: server.state,
    getFeatureState: (name: string) => read(known(name)),
    getServerFeatureState: (name: string) => readServer(known(name)),
    subscribeFeature: (name: string, listener: () => void) => coordinator.subscribe(known(name), listener),
    subscribeState: (listener: () => void) => watch(statefulNames, client.state, listener),
    getKeyedState: (name: string, key: string) => keyedOf(name).store.get(key),
    getServerKeyedState: (name: string, key: string) => keyedOf(name).read(readServer(name), key),
    subscribeKeyed,
    subscribeRow: (name: string, rowId: string, listener: () => void) => subscribeKeyed(name, rowId, listener),
    subscribeColumn: (name: string, columnId: string, listener: () => void) => subscribeKeyed(name, columnId, listener),
    subscribeCell: (name: string, rowId: string, columnId: string, listener: () => void) =>
      subscribeKeyed(name, cellKey(rowId, columnId), listener),
    getColumns: client.columns,
    getServerColumns: server.columns,
    subscribeColumns: (listener: () => void) =>
      watch(
        columnFeatures.map((feature) => feature.name),
        client.columns,
        listener,
        true,
      ),
    getRequest: () => client.request().value,
    getServerRequest: () => server.request().value,
    getRequestKey: requestKey,
    getServerRequestKey: () => server.request().key,
    subscribeRequest: (listener: () => void) =>
      watch(
        requestFeatures.map((feature) => feature.name),
        () => client.request().value,
        listener,
      ),
    computeRows: (data: readonly unknown[], rowsOptions?: TableRowsOptions) => rows(data, baseColumns(), rowsOptions, requestKey),
    updateOptions: (next: Options) => {
      if (next.bind) coordinator.updateControlled(next.bind);
      if (next.meta) meta = Object.freeze({ ...next.meta });
      if (next.omitColumns) {
        const omit = new Set(next.omitColumns);
        const prev = omitCell.snapshot;
        if (omit.size !== prev.size || [...omit].some((id) => !prev.has(id))) replace(omitCell, omit);
      }
    },
    flush: coordinator.flush,
    batch: coordinator.batch,
  });
}
