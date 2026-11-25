import type { AnyTableDef, ColumnPipelineResult, FeatureFactoryLike, KeyedScope, Table, TableRowsOptions, TableRowsView } from "@lunarhue/table-core";
import { isServer } from "@solidjs/web";
import { createMemo, createSignal, getOwner, isHydrating, onCleanup, type Accessor, type Setter } from "solid-js";
import { problem } from "./problem.js";

// The bridge from the store to Solid: one signal per snapshot a primitive
// reads, set from the store's listener and dropped with the owner. On the
// server every reader returns the store's server snapshot and subscribes to
// nothing.
//
// The memos and effects below exist only on the client, so they're
// `transparent`: one that took a hydration id would shift the ids of every
// later sibling, and Solid would build that part of the page from scratch,
// detached, instead of hydrating the server's markup.

/** A table of any rows and features. Every primitive takes one. */
export type AnyTable = Table<never>;

/** A key for keyed state: a fixed string, or an accessor when it can change. */
export type Key = string | Accessor<string>;

/** A feature as the primitives name it: its name, or its factory. */
export type FeatureKey = string | FeatureFactoryLike;

export const nameOf = (feature: FeatureKey): string => (typeof feature === "string" ? feature : feature.featureName);

type Values = Readonly<Record<string, unknown>>;

/**
 * The store behind a table, with feature names as strings and values left
 * unknown. The public primitives put the types back.
 */
export interface Store {
  readonly def: AnyTableDef;
  readonly featureNames: ReadonlySet<string>;
  readonly meta: Values;
  getFeatureState(this: void, name: string): unknown;
  getServerFeatureState(this: void, name: string): unknown;
  subscribeFeature(this: void, name: string, listener: () => void): () => void;
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
}

/**
 * The store behind a table handle. `createTable` and `createTableStore` are
 * the only makers of tables, so a handle is always a store; anything else
 * throws `table:handle`.
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

/**
 * Mirrors one store snapshot in one signal, subscribed for the life of the
 * current owner. With no owner it subscribes to nothing and returns `read`.
 * On the server it returns `serverRead`. While hydrating it starts from the
 * server snapshot and catches up a microtask later, so the markup matches.
 *
 * Core calls listeners synchronously, and a write can come from a component
 * body or a computation, so the signal allows owned writes. Solid applies the
 * write at the next flush.
 */
export function reader<S>(read: () => S, serverRead: () => S, subscribe: (listener: () => void) => () => void): Accessor<S> {
  if (isServer) return serverRead;
  if (getOwner() === null) return read;
  let set: Setter<S> | undefined;
  const sync = () => {
    const next = read();
    set?.(() => next);
  };
  // Subscribe before the first read: the first subscription pulls an external owner's current value.
  onCleanup(subscribe(sync));
  const hydrating = isHydrating();
  const initial = hydrating ? serverRead() : read();
  // Snapshots are frozen objects or plain values, never functions, so the plain-value form of `createSignal` applies.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const [value, setValue] = createSignal<S>(initial as Exclude<S, Function>, { ownedWrite: true });
  set = setValue;
  if (hydrating && !Object.is(initial, read())) queueMicrotask(sync);
  return value;
}

/**
 * Makes `make(key)` for a fixed key, or for an accessor key a reader that
 * moves to the new key when it changes: the old key's subscription goes
 * with the memo run that made it.
 */
export function keyedReader<S>(key: Key, make: (key: string) => Accessor<S>): Accessor<S> {
  if (typeof key === "string") return make(key);
  if (isServer || getOwner() === null) return () => make(key())();
  const current = createMemo(() => make(key()), { transparent: true });
  return () => current()();
}

/** `read` passed through `select`, as a memo when there is an owner, so equal results don't wake readers. */
export function selected<S, T>(read: Accessor<S>, select: (value: S) => T): Accessor<T> {
  if (isServer || getOwner() === null) return () => select(read());
  return createMemo(() => select(read()), { transparent: true });
}

/** What a primitive returns when the table lacks the feature it asks for: always undefined. */
export const nothing = (): undefined => undefined;

/** `compute` as a memo when there is an owner, and as a plain function on the server or with no owner. */
export function derived<T>(compute: () => T): Accessor<T> {
  if (isServer || getOwner() === null) return compute;
  return createMemo(compute, { transparent: true });
}
