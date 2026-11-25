import type { StateUpdater } from "../bindings.js";
import type { RowLike } from "../contract.js";
import type { NeedsInitialState } from "../define-table.js";
import { defineFeature, type Feature } from "../feature.js";

// Filters typed by the app, in two factories that share one state and API.
// `filtering` filters rows on the client with the app's predicate.
// `remoteFiltering` sends the filters to the server and adds no row stage.
// Both are named "filtering", so `requires` and `hasFeature` take either.
//
// `TFilters` extends `object`, not a record type, so an interface without an
// index signature fits it. Edits that leave the filters equal to what they
// were write nothing, so they don't wake pagination or selection either.

/** The keys of `T` that `T` may leave out. */
export type OptionalFilterKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/** The keys of `T` whose value is an array, as a multi-select filter's is. */
export type ArrayFilterKeys<T> = { [K in keyof T]-?: NonNullable<T[K]> extends readonly unknown[] ? K : never }[keyof T];

/** The item type of an array filter value. */
export type ArrayElement<T> = NonNullable<T> extends readonly (infer E)[] ? E : never;

/**
 * What `set` takes for key `K`: a value or a function of the last value.
 * An optional key also takes `undefined`, which removes the key, so the
 * filters stay sound under `exactOptionalPropertyTypes`.
 */
export type FilterValue<T, K extends keyof T> = StateUpdater<K extends OptionalFilterKeys<T> ? T[K] : Exclude<T[K], undefined>>;

/** The edits a filter API and a filter draft share. */
export interface FilterEdits<TFilters extends object> {
  /** Sets one filter. `undefined`, or an updater that returns it, removes an optional key. */
  set<K extends keyof TFilters>(this: void, key: K, value: FilterValue<TFilters, K>): void;
  /** Removes an optional filter. */
  unset(this: void, key: OptionalFilterKeys<TFilters>): void;
  /**
   * Adds `item` to an array filter, or removes it when the array has it. A
   * missing key starts as `[item]`. Removing the last item leaves `[]`, which
   * `isFiltered` reads as no filter. Call `unset` to drop the key.
   */
  toggle<K extends ArrayFilterKeys<TFilters>>(this: void, key: K, item: ArrayElement<TFilters[K]>): void;
  /** Replaces all the filters. */
  replace(this: void, next: StateUpdater<TFilters>): void;
}

/** The `filtering` API on a table, from either factory. */
export interface FilteringApi<TFilters extends object> extends FilterEdits<TFilters> {
  /** The filters now. */
  get(this: void): TFilters;
  /**
   * Clears every filter to the cleared filters: `options.empty` when given.
   * Without it, strings in the starting filters become `""`, arrays become
   * `[]`, other values keep their starting value, and keys the starting
   * filters lack are removed. Pass `empty` when `""` or `[]` doesn't fit a
   * filter's type, as for a union of string literals.
   */
  clear(this: void): void;
  /** Sets the filters back to where they started: `initialState.filtering`, or the factory's `initial`. */
  reset(this: void): void;
}

/** What both factories take. */
export interface FilteringBaseOptions<TFilters extends object> {
  /** The starting filters. Leave it out for filters a table sets in `initialState`. */
  readonly initial?: TFilters;
  /** The filters `clear` sets. */
  readonly empty?: TFilters;
  /** Whether two filters are equal, to skip writes that change nothing. Defaults to comparing values deeply. */
  isEqual?(this: void, a: TFilters, b: TFilters): boolean;
}

/** What `filtering` takes. */
export interface FilteringOptions<TFilters extends object, TRow = unknown> extends FilteringBaseOptions<TFilters> {
  /** Whether a row matches the filters. Only data rows are tested. */
  rows(this: void, row: TRow, filters: TFilters): boolean;
}

/** What `remoteFiltering` takes. */
export type RemoteFilteringOptions<TFilters extends object> = FilteringBaseOptions<TFilters>;

/** The feature `filtering` makes. It has no `request` seam. */
export type FilteringFeature<TFilters extends object, TRow = unknown> = Feature<
  "filtering",
  FilteringOptions<TFilters, TRow>,
  TFilters,
  FilteringApi<TFilters>,
  never,
  false,
  readonly []
>;

/** The feature `remoteFiltering` makes. Its request is the filters. */
export type RemoteFilteringFeature<TFilters extends object> = Feature<
  "filtering",
  RemoteFilteringOptions<TFilters> | undefined,
  TFilters,
  FilteringApi<TFilters>,
  TFilters,
  true,
  readonly []
>;

/** `TFeature`, marked `NeedsInitialState` when `TFilters` has a required key. */
export type FiltersNeedInitial<TFilters extends object, TFeature extends Feature> = {} extends TFilters
  ? TFeature
  : NeedsInitialState<TFeature>;

type Values = Record<PropertyKey, unknown>;

const isPlainObject = (value: unknown): value is Values =>
  value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

/** Compares arrays item by item and plain objects key by key, and everything else by `Object.is`. */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
};

/** True for the values a filter has when it filters nothing: `undefined`, `""` and `[]`. */
const isBlank = (value: unknown): boolean => value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/**
 * Whether `state` differs from `baseline`, key by key. `undefined`, a
 * missing key, `""` and `[]` all count as blank and equal each other.
 * Arrays compare item by item, in order, and plain objects key by key.
 */
export function isFiltered<TFilters extends object>(state: TFilters, baseline: TFilters): boolean {
  // The filters are objects; their keys index them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const a = state as Values;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const b = baseline as Values;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[key];
    const y = b[key];
    if (!(isBlank(x) && isBlank(y)) && !sameValue(x, y)) return true;
  }
  return false;
}

const resolve = <T>(updater: StateUpdater<T>, prev: T): T =>
  // Filter values aren't functions, so a function is always an updater.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  typeof updater === "function" ? (updater as (prev: T) => T)(prev) : updater;

const withKey = (state: Values, key: PropertyKey, value: unknown): Values => {
  const next = { ...state };
  if (value === undefined) Reflect.deleteProperty(next, key);
  else next[key] = value;
  return next;
};

const toggled = (value: unknown, item: unknown): readonly unknown[] => {
  const list: readonly unknown[] = Array.isArray(value) ? value : [];
  const kept = list.filter((entry) => !Object.is(entry, item));
  return kept.length === list.length ? [...list, item] : kept;
};

/** The cleared filters `clear` falls back to without `options.empty`. */
const cleared = (initial: Values): Values => {
  const next: Values = {};
  for (const key of Object.keys(initial)) {
    const value = initial[key];
    next[key] = typeof value === "string" ? "" : Array.isArray(value) ? [] : value;
  }
  return next;
};

/** Makes the edits on top of reading and writing whole filters. */
function edits<TFilters extends object>(read: () => TFilters, write: (next: TFilters) => void): FilterEdits<TFilters> {
  // Edits build new filters key by key; the result has the keys `TFilters` allows.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const update = (fn: (state: Values) => Values) => write(fn(read() as Values) as TFilters);
  return {
    set: (key, value) => update((state) => withKey(state, key, resolve<unknown>(value, state[key]))),
    unset: (key) => update((state) => withKey(state, key, undefined)),
    toggle: (key, item) => update((state) => withKey(state, key, toggled(state[key], item))),
    replace: (next) => write(resolve(next, read())),
  };
}

function filteringApi<TFilters extends object>(
  ctx: { readonly initial: TFilters; getState(this: void): TFilters; setState(this: void, next: TFilters): void },
  options: FilteringBaseOptions<TFilters> | undefined,
): FilteringApi<TFilters> {
  const isEqual = options?.isEqual ?? sameValue;
  const write = (next: TFilters) => {
    if (!isEqual(ctx.getState(), next)) ctx.setState(next);
  };
  // `cleared` keeps the starting filters' keys and value types.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const empty = () => options?.empty ?? (cleared(ctx.initial as Values) as TFilters);
  return {
    ...edits(ctx.getState, write),
    get: ctx.getState,
    clear: () => write(empty()),
    reset: () => write(ctx.initial),
  };
}

const startOf = <TFilters extends object>(options: FilteringBaseOptions<TFilters> | undefined): TFilters =>
  // Without `initial` or `empty`, the filters either allow `{}` or are marked `NeedsInitialState`, so the table's `initialState` replaces this.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  options?.initial ?? options?.empty ?? ({} as TFilters);

/**
 * Filters rows on the client: a row stays when `options.rows` returns true
 * for its data and the filters. A filter change writes with rows effect
 * `"matching"`, so pagination and selection reset in the same change.
 *
 * Give `initial` or set `initialState.filtering` in the table. When the
 * filters have a required key and no `initial`, the table must set them.
 */
export function filtering<TFilters extends object, TRow = unknown>(
  options: FilteringOptions<TFilters, TRow> & { readonly initial: TFilters },
): FilteringFeature<TFilters, TRow>;
export function filtering<TFilters extends object, TRow = unknown>(
  options: FilteringOptions<TFilters, TRow>,
): FiltersNeedInitial<TFilters, FilteringFeature<TFilters, TRow>>;
export function filtering<TFilters extends object, TRow = unknown>(
  options: FilteringOptions<TFilters, TRow>,
): FilteringFeature<TFilters, TRow> {
  return defineFeature<"filtering", FilteringOptions<TFilters, TRow>, TFilters, FilteringApi<TFilters>>({
    name: "filtering",
    state: { initial: startOf(options), rowsEffect: "matching" },
    api: (ctx) => filteringApi<TFilters>(ctx, ctx.options),
    rowStage: {
      phase: "filter",
      reads: ["filtering"],
      run: (rows, ctx) => {
        const kept = rows.filter(
          // Data rows hold the app's rows, which `rows` takes.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          (row: RowLike) => row.kind !== "data" || ctx.options.rows(row.original as TRow, ctx.state),
        );
        return kept.length === rows.length ? rows : kept;
      },
    },
  })(options);
}
filtering.featureName = "filtering" as const;

/**
 * Filters rows on the server: the filters go into `getRequest()` under
 * `filtering`, and no row stage runs. A filter change writes with rows
 * effect `"matching"`, as with `filtering`.
 */
export function remoteFiltering<TFilters extends object>(
  options: RemoteFilteringOptions<TFilters> & { readonly initial: TFilters },
): RemoteFilteringFeature<TFilters>;
export function remoteFiltering<TFilters extends object>(
  options?: RemoteFilteringOptions<TFilters>,
): FiltersNeedInitial<TFilters, RemoteFilteringFeature<TFilters>>;
export function remoteFiltering<TFilters extends object>(options?: RemoteFilteringOptions<TFilters>): RemoteFilteringFeature<TFilters> {
  const factory = defineFeature<"filtering", RemoteFilteringOptions<TFilters> | undefined, TFilters, FilteringApi<TFilters>, TFilters>({
    name: "filtering",
    state: { initial: startOf(options), rowsEffect: "matching" },
    api: (ctx) => filteringApi<TFilters>(ctx, ctx.options),
    request: (state) => state,
  });
  // `HasRequest<TFilters>` stays unresolved for a generic `TFilters`; it is `true` for every object type.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return factory(options) as RemoteFilteringFeature<TFilters>;
}
remoteFiltering.featureName = "filtering" as const;

/** Filter edits held back from the table until `commit`, for a filter UI the user hasn't finished. */
export interface FilterDraft<TFilters extends object> extends FilterEdits<TFilters> {
  /** The draft while it has edits, and the table's filters otherwise. */
  get(this: void): TFilters;
  /** Whether the draft has edits the table doesn't. */
  isDirty(this: void): boolean;
  /** Calls `listener` after each draft edit, commit and discard. Returns the unsubscribe. */
  subscribe(this: void, listener: () => void): () => void;
  /** Writes the draft to the table in one change, then follows the table again. */
  commit(this: void): void;
  /** Drops the draft's edits. */
  discard(this: void): void;
}

/**
 * Makes a draft of a table's filters. Edits change the draft only: no row
 * stage runs and no rows effect fires until `commit`. A draft without edits
 * reads the table's filters, so read the table to follow them.
 */
export function createFilterDraft<TFilters extends object>(table: {
  readonly filtering: FilteringApi<TFilters>;
}): FilterDraft<TFilters> {
  const api = table.filtering;
  const listeners = new Set<() => void>();
  let draft: { readonly value: TFilters } | undefined;
  const notify = () => listeners.forEach((listener) => listener());
  const get = () => (draft ? draft.value : api.get());
  const settle = (fn: () => void) => {
    const had = draft;
    fn();
    draft = undefined;
    if (had) notify();
  };
  return {
    ...edits(get, (value) => {
      draft = { value };
      notify();
    }),
    get,
    isDirty: () => draft !== undefined,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    commit: () => settle(() => draft && api.replace(draft.value)),
    discard: () => settle(() => {}),
  };
}
