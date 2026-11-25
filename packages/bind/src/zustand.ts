import type { ExternalGroupBinding, ExternalSliceBinding } from "@lunarhue/table-core";

// The declarations bundle core's types, so a consumer's emitted declarations
// can name the types these functions return only through this entry.
export type { ExternalGroupBinding, ExternalSliceBinding };

/**
 * The part of a Zustand store the binding uses. The hook `create` returns
 * fits, and so does a vanilla store from `createStore`.
 */
export interface ZustandStore<S> {
  getState(): S;
  /** Merges `partial` into the state, or with `replace`, makes it the state. */
  setState(partial: Partial<S>, replace?: boolean): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

/** Binds a table slice to part of the store's state. */
export interface ZustandSliceOptions<S, T> {
  /** Picks the table slice out of the store's state. */
  readonly select: (state: S) => T;
  /**
   * Turns a table slice into the state to merge in, such as
   * `(sorting) => ({ sorting })`. `state` is the store's state before the
   * write, for a slice that sits inside a bigger object.
   */
  readonly update: (value: T, state: S) => Partial<S>;
  /**
   * Whether two slices are the same, `Object.is` by default. Pass one when
   * `select` builds a new object each time, so a store change that leaves
   * those fields alone keeps the slice the table already has.
   */
  readonly isEqual?: (previous: T, next: T) => boolean;
  /** Picks the slice a server render shows. Defaults to `select` on the current state. */
  readonly getServerSnapshot?: () => T;
}

/** Binds several table slices to one store, written together. */
export type ZustandGroupOptions<S, TSlices extends object> = ZustandSliceOptions<S, TSlices>;

/** The cached `get`, `set` and `subscribe` both bindings share. `replace` writes the whole state. */
function connect<S, T>(
  store: ZustandStore<S>,
  { select, update, isEqual = Object.is, getServerSnapshot }: ZustandSliceOptions<S, T>,
  replace?: boolean,
): ExternalSliceBinding<T> {
  // The slice `get` last returned. The table compares slices by reference,
  // so an equal slice hands back this one and doesn't count as a change.
  let last = select(store.getState());
  return {
    get() {
      const next = select(store.getState());
      return isEqual(last, next) ? last : (last = next);
    },
    ...(getServerSnapshot ? { getServerSnapshot } : {}),
    set: (value) => store.setState(update(value, store.getState()), replace),
    subscribe: (listener) => store.subscribe(() => listener()),
  };
}

// The slice overload comes first, so a call with options always gets
// `select`, `update` and `isEqual` typed against the store's state.
/**
 * Binds a table slice to the part of a Zustand store's state that `select`
 * picks. A table write calls `setState(update(value, state))`.
 *
 * ```ts
 * useTable(usersTable, { bind: { sorting: zustand(store, { select: (s) => s.sorting, update: (sorting) => ({ sorting }) }) } });
 * ```
 */
export function zustand<S, T>(store: ZustandStore<S>, options: ZustandSliceOptions<S, T>): ExternalSliceBinding<T>;
/**
 * Binds a table slice to a Zustand store's whole state. A table write
 * replaces the state, so give the store no actions, or bind part of it.
 */
export function zustand<S>(store: ZustandStore<S>): ExternalSliceBinding<S>;
export function zustand<S>(store: ZustandStore<S>, options?: ZustandSliceOptions<S, S>): ExternalSliceBinding<S> {
  return options ? connect(store, options) : connect(store, { select: (state) => state, update: (value) => value }, true);
}

/**
 * Binds several table slices to one Zustand store. `select` returns every
 * slice it owns, and a table change that touches several of them calls
 * `setState` once. Pass the result under each slice it owns:
 *
 * ```ts
 * const group = zustandGroup(store, {
 *   select: (s) => ({ filtering: s.filtering, pagination: s.pagination }),
 *   update: (slices) => slices,
 *   isEqual: (a, b) => a.filtering === b.filtering && a.pagination === b.pagination,
 * });
 * useTable(usersTable, { bind: { filtering: group, pagination: group } });
 * ```
 */
export function zustandGroup<S, TSlices extends object>(
  store: ZustandStore<S>,
  options: ZustandGroupOptions<S, TSlices>,
): ExternalGroupBinding<TSlices> {
  const { get, getServerSnapshot, set, subscribe } = connect(store, options);
  return { kind: "group", get, ...(getServerSnapshot ? { getServerSnapshot } : {}), set, subscribe };
}
