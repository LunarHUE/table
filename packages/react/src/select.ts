import { useState } from "react";
import { useSyncExternalStore } from "#lunarhue/react";

/** Whether two selected values count as the same, so the component skips a re-render. */
export type IsEqual<T> = (a: T, b: T) => boolean;

/** An external value as `useSyncExternalStore` reads it. Each function keeps its identity. */
export interface Source<S> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly get: () => S;
  readonly server: () => S;
}

/** A `Map` or `WeakMap`, as `cached` uses it. */
export interface Cache<K, V> {
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
}

/** Returns the value cached for `key`, making it with `make` on first use. */
export function cached<K, V>(map: Cache<K, V>, key: K, make: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = make();
    map.set(key, value);
  }
  return value;
}

/** The last value one component selected, and what it was selected from. */
interface LastSelection<S, T> {
  readonly snapshot: S;
  readonly select: (snapshot: S) => T;
  readonly value: T;
}

/** Reads a snapshot through a selector. See `newSelection`. */
type Selection<S, T> = (snapshot: S, select: (snapshot: S) => T, isEqual: IsEqual<T>) => T;

/**
 * Remembers one component's last selection. The same snapshot and selector
 * give the same value, so `getSnapshot` is stable. A new selection that
 * equals the last one by `isEqual` returns the last one, so React sees no
 * change and skips the re-render.
 */
function newSelection<S, T>(): Selection<S, T> {
  let last: LastSelection<S, T> | undefined;
  return (snapshot, select, isEqual) => {
    if (last !== undefined && last.snapshot === snapshot && last.select === select) return last.value;
    const picked = select(snapshot);
    const value = last !== undefined && isEqual(last.value, picked) ? last.value : picked;
    last = { snapshot, select, value };
    return value;
  };
}

/**
 * Reads `source` through `useSyncExternalStore` and re-renders only when the
 * selected value changes by `isEqual`. The last selection lives in a closure
 * made once by `useState`, not in a ref, and only `getSnapshot` touches it.
 */
export function useSelected<S, T>(source: Source<S>, select: (snapshot: S) => T, isEqual: IsEqual<T> = Object.is): T {
  const [read] = useState<Selection<S, T>>(newSelection);
  return useSyncExternalStore(
    source.subscribe,
    () => read(source.get(), select, isEqual),
    () => read(source.server(), select, isEqual),
  );
}

/** Reads `source` as it is. */
export function useSource<S>(source: Source<S>): S {
  return useSyncExternalStore(source.subscribe, source.get, source.server);
}
