import {
  cellKey,
  type AnyTableDef,
  type ColumnPipelineResult,
  type KeyedScope,
  type Table,
  type TableRowsOptions,
  type TableRowsView,
  type TableStoreOptions,
} from "@lunarhue/table-core";
import { problem } from "./problem.js";
import { cached, type Source } from "./select.js";

/** A table of any rows and features. Every hook takes one. */
export type AnyTable = Table<never>;

type Values = Readonly<Record<string, unknown>>;

/**
 * The store behind a table, with feature names as strings and values left
 * unknown. The public hooks put the types back.
 */
export interface Store {
  readonly def: AnyTableDef;
  readonly featureNames: ReadonlySet<string>;
  readonly meta: Values;
  getState(this: void): Values;
  getServerState(this: void): Values;
  getFeatureState(this: void, name: string): unknown;
  getServerFeatureState(this: void, name: string): unknown;
  subscribeFeature(this: void, name: string, listener: () => void): () => void;
  subscribeState(this: void, listener: () => void): () => void;
  getKeyedState(this: void, feature: string, key: string): unknown;
  getServerKeyedState(this: void, feature: string, key: string): unknown;
  subscribeKeyed(this: void, feature: string, key: string, listener: () => void): () => void;
  getColumns(this: void): ColumnPipelineResult<unknown>;
  getServerColumns(this: void): ColumnPipelineResult<unknown>;
  subscribeColumns(this: void, listener: () => void): () => void;
  getRequest(this: void): unknown;
  getServerRequest(this: void): unknown;
  subscribeRequest(this: void, listener: () => void): () => void;
  computeRows(this: void, data: readonly unknown[], options?: TableRowsOptions): TableRowsView<unknown>;
  updateOptions(this: void, next: TableStoreOptions<AnyTableDef>): void;
  flush(this: void): void;
}

/**
 * The store behind a table handle. `useTable` and `createTableStore` are the
 * only makers of tables, so a handle is always a store; anything else throws
 * `table:handle`.
 */
export function storeOf(table: AnyTable): Store {
  if (!("subscribeState" in table)) throw new Error(problem("table:handle"));
  // Every table handle is a store; the public types leave the store methods out so generic components can take any table.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return table as unknown as Store;
}

/** Whether the table has a feature with state under `name`. */
export const isStateful = (store: Store, name: string): boolean => store.def.resolvedFeatures.byName.get(name)?.def.state !== undefined;

/** How the feature named `name` keys its state, or undefined when it isn't keyed or isn't installed. */
export const keyedScope = (store: Store, name: string): KeyedScope | undefined =>
  store.def.resolvedFeatures.byName.get(name)?.def.state?.keyed;

const noop = () => {};
const nothing = () => undefined;

/** The source a hook reads when the table lacks the feature it asks for: always undefined, and never wakes. */
export const noSource: Source<undefined> = Object.freeze({ subscribe: () => noop, get: nothing, server: nothing });

const stateSources = new WeakMap<Store, Source<Values>>();
const columnSources = new WeakMap<Store, Source<ColumnPipelineResult<unknown>>>();
const requestSources = new WeakMap<Store, Source<unknown>>();
const featureSources = new WeakMap<Store, Map<string, Source<unknown>>>();
const keyedSources = new WeakMap<Store, Map<string, Source<unknown>>>();

/** The source of every feature's state. */
export const stateSource = (store: Store): Source<Values> =>
  cached(stateSources, store, () => ({ subscribe: store.subscribeState, get: store.getState, server: store.getServerState }));

/** The source of the column pipeline's result. */
export const columnsSource = (store: Store): Source<ColumnPipelineResult<unknown>> =>
  cached(columnSources, store, () => ({ subscribe: store.subscribeColumns, get: store.getColumns, server: store.getServerColumns }));

/** The source of the server request. */
export const requestSource = (store: Store): Source<unknown> =>
  cached(requestSources, store, () => ({ subscribe: store.subscribeRequest, get: store.getRequest, server: store.getServerRequest }));

/** The source of one feature's state, or `noSource` when the table has no such state. */
export function featureSource(store: Store, name: string): Source<unknown> {
  if (!isStateful(store, name)) return noSource;
  return cached(cached(featureSources, store, () => new Map<string, Source<unknown>>()), name, () => ({
    subscribe: (listener) => store.subscribeFeature(name, listener),
    get: () => store.getFeatureState(name),
    server: () => store.getServerFeatureState(name),
  }));
}

/**
 * The source of the part of a keyed feature's state for one key. A table
 * can have many rows, so the source leaves the cache when its last listener
 * goes, and a later render makes a new one. Returns `noSource` when the
 * feature isn't installed or isn't keyed by `scope`.
 */
export function keyedSource(store: Store, scope: KeyedScope, feature: string, key: string): Source<unknown> {
  if (keyedScope(store, feature) !== scope) return noSource;
  const map = cached(keyedSources, store, () => new Map<string, Source<unknown>>());
  const id = cellKey(feature, key);
  let source = map.get(id);
  if (source) return source;
  let listeners = 0;
  const made: Source<unknown> = {
    subscribe: (listener) => {
      listeners++;
      const off = store.subscribeKeyed(feature, key, listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        off();
        if (--listeners === 0 && map.get(id) === made) map.delete(id);
      };
    },
    get: () => store.getKeyedState(feature, key),
    server: () => store.getServerKeyedState(feature, key),
  };
  source = made;
  map.set(id, source);
  return source;
}

const rowsSubscribers = new WeakMap<Store, Map<boolean, (listener: () => void) => () => void>>();

/**
 * Subscribes to what the rows depend on: the slices the row stages read,
 * pagination's slice for the page size, the columns, and, when the view
 * checks a request key, the request. Writes to anything else, such as
 * selection, wake nothing.
 */
export function rowsSubscribe(store: Store, withRequest: boolean): (listener: () => void) => () => void {
  const byFlag = cached(rowsSubscribers, store, () => new Map<boolean, (listener: () => void) => () => void>());
  return cached(byFlag, withRequest, () => {
    const names = new Set<string>();
    for (const feature of store.def.resolvedFeatures.ordered) {
      const stage = feature.def.rowStage;
      if (!stage) continue;
      names.add(feature.name);
      for (const name of stage.reads ?? []) names.add(name);
    }
    names.add("pagination");
    const slices = [...names].filter((name) => isStateful(store, name));
    return (listener) => {
      const offs = slices.map((name) => store.subscribeFeature(name, listener));
      offs.push(store.subscribeColumns(listener));
      if (withRequest) offs.push(store.subscribeRequest(listener));
      return () => offs.forEach((off) => off());
    };
  });
}

/** One listener list per store for the table's `meta`, which the store itself doesn't announce. */
interface MetaSource extends Source<Values> {
  readonly notify: () => void;
}

const metaSources = new WeakMap<Store, MetaSource>();

/** The source of the table's `meta`. `useTable` calls `notify` after it hands the store new meta. */
export const metaSource = (store: Store): MetaSource =>
  cached(metaSources, store, () => {
    const listeners = new Set<() => void>();
    return {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      get: () => store.meta,
      server: () => store.meta,
      notify: () => listeners.forEach((listener) => listener()),
    };
  });
