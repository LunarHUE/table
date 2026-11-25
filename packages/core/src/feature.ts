import type { SlicePatch, StateUpdater } from "./bindings.js";
import type { KeyedScope } from "./cells.js";
import type { ColumnInfo, ColumnViewInfo, RowLike, RowsEffect, RowStagePhase } from "./contract.js";
import { problem } from "./problem.js";

// Every feature, built in or not, is made by `defineFeature` and plugs into
// the table through the same five seams. Callable members of the seam
// types are written as methods. Method parameters compare both ways, so a
// feature of any state, options and API fits `AnyFeature`, and the store
// can hold a list of them without `any`.

/**
 * This copy of core. Each feature carries it, so `resolveFeatures` can tell
 * features made by another copy, whose store wouldn't run them correctly.
 */
const brand: object = {};

/** The arguments a feature factory takes for options `O`: none for `void`, an optional one when `O` takes `undefined`. */
export type OptionArgs<O> = [O] extends [void] ? [] : undefined extends O ? [options?: O] : [options: O];

/** Anything that names a feature without making one: a factory, or a hand-written generic factory with `featureName` set. */
export interface FeatureFactoryLike<TName extends string = string> {
  readonly featureName: TName;
}

/** A feature factory of any name, options and feature. */
export interface AnyFeatureFactory extends FeatureFactoryLike {
  (...options: never): AnyFeature;
}

/** What `requires` returns: the factories of the features a feature needs. */
export type Requirements = readonly AnyFeatureFactory[];

/** The features a `requires` list names, as the factories make them. */
export type RequiredFeatures<TRequires extends Requirements> = {
  readonly [K in keyof TRequires]: TRequires[K] extends (...options: never) => infer F ? F : never;
};

/** The states of the features a `requires` list names, by name. */
export type RequiredStateMap<TRequires extends Requirements> = FeatureStateMap<RequiredFeatures<TRequires>>;

/** Options for a state write. */
export interface WriteOptions {
  /** What the write does to the rows. Defaults to the writing feature's `state.rowsEffect`. */
  readonly rowsEffect?: RowsEffect;
}

/** Reads the state of a feature this one `requires`. */
export interface FeatureStateReader<TRequires extends Requirements> {
  getFeatureState<K extends keyof RequiredStateMap<TRequires> & string>(this: void, name: K): RequiredStateMap<TRequires>[K];
}

/** What a feature's `api` seam gets from the table. */
export interface FeatureApiContext<TName extends string, TState, TOptions, TRequires extends Requirements = readonly []>
  extends FeatureStateReader<TRequires> {
  readonly name: TName;
  readonly options: TOptions;
  /** The state the feature started with. */
  readonly initial: TState;
  getState(this: void): TState;
  /** Writes the feature's state. */
  setState(this: void, updater: StateUpdater<TState>, options?: WriteOptions): void;
  /** Writes this feature's state and the states of the features it requires, in one change. */
  patch(
    this: void,
    updates: SlicePatch<{ readonly [K in TName as [TState] extends [never] ? never : K]: TState } & RequiredStateMap<TRequires>>,
    options?: WriteOptions,
  ): void;
  /** The table's columns now. */
  columns(this: void): readonly ColumnInfo[];
}

/** What `state.onRowsEffect` gets besides the effect and the state. */
export interface RowsEffectContext<TOptions> {
  readonly options: TOptions;
  readonly columns: readonly ColumnInfo[];
  /** The name of the feature whose write had the effect. */
  readonly source: string;
}

/** Makes a feature's starting state from its options. A method type, so it compares both ways. */
export type InitialState<TOptions, TState> = { make(this: void, options: TOptions): TState }["make"];

/** The state seam: a slice of table state the feature owns. */
export interface FeatureStateSeam<TState, TOptions> {
  /** The starting state, or a function of the options that makes it. A state that is itself a function must come from the function form. */
  readonly initial: TState | InitialState<TOptions, TState>;
  /** Set when the state is read one row, column or cell at a time, as selection is. */
  readonly keyed?: KeyedScope;
  /** Reads the part of the state that belongs to one key. Return an equal value, by `Object.is`, when that part didn't change. */
  keyedRead?(this: void, state: TState, key: string): unknown;
  /** What a write of this state does to the rows, unless the write says otherwise. Defaults to `"view"`. */
  readonly rowsEffect?: RowsEffect;
  /** Fixes the state after the columns change, such as by dropping ids of columns that are gone. */
  normalize?(this: void, state: TState, columns: readonly ColumnInfo[]): TState;
  /**
   * Runs in every write whose rows effect isn't `"none"`, with the effect,
   * and returns this feature's state after it. The new state lands in the
   * same change as the write. Pagination uses it to go back to the first
   * page when the matching rows change.
   */
  onRowsEffect?(this: void, effect: RowsEffect, state: TState, ctx: RowsEffectContext<TOptions>): TState;
}

/** What a row stage gets besides the rows. */
export interface RowStageContext<TState, TOptions, TRequires extends Requirements = readonly []>
  extends FeatureStateReader<TRequires> {
  readonly state: TState;
  readonly options: TOptions;
  readonly columns: readonly ColumnInfo[];
}

/** The row stage seam: a step in the row pipeline. */
export interface RowStage<TState, TOptions, TRequires extends Requirements = readonly []> {
  readonly phase: RowStagePhase;
  /** The names of other features whose state the stage reads. The stage runs again when any of them changes. */
  readonly reads?: readonly string[];
  run(this: void, rows: readonly RowLike[], ctx: RowStageContext<TState, TOptions, TRequires>): readonly RowLike[];
}

/**
 * A feature's definition, as `defineFeature` takes it. Every seam is
 * optional. `TRequest` is what `request` returns for the server; a client
 * feature leaves `request` out and does its work in `rowStage`.
 */
export interface FeatureDef<
  TName extends string,
  TOptions,
  TState,
  TApi,
  TRequest,
  TRequires extends Requirements = readonly [],
> {
  /** Unique among a table's features. It keys the feature's state, API and request. */
  readonly name: TName;
  /**
   * The features this one needs, as their factories: `() => [sorting]`. The
   * table must install them too, and runs their seams first. It's a
   * function so modules that import each other's factories still load.
   */
  readonly requires?: () => TRequires;
  readonly state?: FeatureStateSeam<TState, TOptions>;
  /** Makes the feature's commands, once per table. */
  api?(this: void, ctx: FeatureApiContext<TName, TState, TOptions, TRequires>): TApi;
  readonly rowStage?: RowStage<TState, TOptions, TRequires>;
  /** Changes how the columns show: hides, orders, pins or sizes them. */
  columnStage?(this: void, columns: readonly ColumnViewInfo[], state: TState, options: TOptions): readonly ColumnViewInfo[];
  /** The part of a server request this feature owns. */
  request?(this: void, state: TState, options: TOptions): TRequest;
}

/**
 * A feature, as its factory makes it, ready for a table's feature list. The
 * `~` members hold types only and are never set.
 */
export interface Feature<
  TName extends string = string,
  TOptions = unknown,
  TState = unknown,
  TApi = unknown,
  TRequest = unknown,
  THasRequest extends boolean = boolean,
  TRequires extends Requirements = Requirements,
> {
  readonly "~core": object;
  readonly name: TName;
  readonly options: TOptions;
  readonly def: FeatureDef<TName, TOptions, TState, TApi, TRequest, TRequires>;
  readonly "~state"?: TState;
  readonly "~api"?: TApi;
  readonly "~request"?: TRequest;
  readonly "~hasRequest"?: THasRequest;
}

/** A feature of any name, options, state and API. */
export type AnyFeature = Feature;

/** True when a feature has a `request` seam. */
export type HasRequest<TRequest> = [TRequest] extends [never] ? false : true;

/** A feature factory, as `defineFeature` returns it. Call it, with options when the feature takes them, for the feature. */
export type FeatureFactory<
  TName extends string,
  TOptions,
  TState,
  TApi,
  TRequest,
  THasRequest extends boolean,
  TRequires extends Requirements = readonly [],
> = FeatureFactoryLike<TName> &
  ((...options: OptionArgs<TOptions>) => Feature<TName, TOptions, TState, TApi, TRequest, THasRequest, TRequires>);

/**
 * Makes a feature factory from its definition. `TOptions` comes from the
 * type of the options parameter in any seam, and is `void`, for a factory
 * that takes none, when no seam names it.
 *
 * A feature with a generic state, such as filters typed by the app, is a
 * generic function that calls `defineFeature` and its factory, with
 * `featureName` set so `requires` and `part` can name it:
 *
 * ```ts
 * export function filtering<TFilters extends JsonObject>(options: { initial: TFilters }) {
 *   return defineFeature({ name: "filtering", state: { initial: options.initial } })();
 * }
 * filtering.featureName = "filtering" as const;
 * ```
 */
export function defineFeature<
  TName extends string,
  TOptions = void,
  TState = never,
  TApi = never,
  TRequest = never,
  const TRequires extends Requirements = readonly [],
>(
  def: FeatureDef<TName, TOptions, TState, TApi, TRequest, TRequires>,
): FeatureFactory<TName, TOptions, TState, TApi, TRequest, HasRequest<TRequest>, TRequires> {
  const name = def.name;
  // The factory takes `options` as its parameters' type allows: none for `void`, optional or required otherwise.
  const create = (options?: TOptions) => Object.freeze({ "~core": brand, name, options, def });
  // `OptionArgs` stays unresolved inside this function, so the factory's type is asserted. The cases are spelled out in `OptionArgs`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return Object.assign(create, { featureName: name }) as unknown as FeatureFactory<
    TName,
    TOptions,
    TState,
    TApi,
    TRequest,
    HasRequest<TRequest>,
    TRequires
  >;
}

/** The name of a feature or feature factory. */
export type FeatureNameOf<T> = T extends FeatureFactoryLike<infer N> ? N : T extends { readonly name: infer N extends string } ? N : never;
/** The state type of a feature, or `never` for a feature without state. */
export type FeatureStateOf<T> = T extends { readonly "~state"?: infer S } ? S : never;
/** The API type of a feature, or `never` for a feature without an API. */
export type FeatureApiOf<T> = T extends { readonly "~api"?: infer A } ? A : never;
/** The request type of a feature, or `never` for a feature without a `request` seam. */
export type FeatureRequestOf<T> = T extends { readonly "~request"?: infer R } ? R : never;

/** The APIs of a feature list, by feature name. Features without an API have no key. */
export type FeatureApiMap<TFeatures extends readonly AnyFeature[]> = {
  readonly [F in TFeatures[number] as [FeatureApiOf<F>] extends [never] ? never : F["name"]]: FeatureApiOf<F>;
};

/** The states of a feature list, by feature name. Features without state have no key. */
export type FeatureStateMap<TFeatures extends readonly AnyFeature[]> = {
  readonly [F in TFeatures[number] as [FeatureStateOf<F>] extends [never] ? never : F["name"]]: FeatureStateOf<F>;
};

/** The server request of a feature list, by feature name. Only features with a `request` seam have a key. */
export type ServerRequestMap<TFeatures extends readonly AnyFeature[]> = {
  readonly [F in TFeatures[number] as F extends { readonly "~hasRequest"?: true } ? F["name"] : never]: FeatureRequestOf<F>;
};

/** The names of the features that the features of a list require. */
export type RequiredByFeatures<TFeatures extends readonly AnyFeature[]> =
  TFeatures[number]["def"] extends infer D
    ? D extends { readonly requires?: () => infer R extends Requirements }
      ? R[number]["featureName"]
      : never
    : never;

/** The names required by features of a list and missing from it. `never` when the list is complete. */
export type MissingRequirements<TFeatures extends readonly AnyFeature[]> = Exclude<
  RequiredByFeatures<TFeatures>,
  TFeatures[number]["name"]
>;

/**
 * A feature's part, for a column or cell: `selectable()` on a column puts a
 * checkbox there for the selection feature. It holds the feature's name,
 * which the table checks is installed, and the config the feature reads
 * where the part attaches. `TPartApi` is type information for what the part
 * gives where it attaches.
 */
export interface FeaturePart<TFeatureName extends string = string, TConfig = unknown, TPartApi = unknown> {
  readonly feature: TFeatureName;
  readonly config: TConfig;
  readonly "~api"?: TPartApi;
}

/** A part of any feature. */
export type AnyFeaturePart = FeaturePart;

/** Makes a part of `feature` with `config`. Give `TPartApi` to type what the part gives where it attaches. */
export function part<TFeatureName extends string, TConfig, TPartApi = unknown>(
  feature: FeatureFactoryLike<TFeatureName>,
  config: TConfig,
): FeaturePart<TFeatureName, TConfig, TPartApi> {
  return Object.freeze({ feature: feature.featureName, config });
}

/** The names of the features a list of parts belongs to. */
export type RequiredFeatureNames<TParts extends readonly AnyFeaturePart[]> = TParts[number]["feature"];

/** A feature list, checked and put in the order its seams run. */
export interface ResolvedFeatures {
  /** Install order, except that each feature comes after the features it requires. */
  readonly ordered: readonly AnyFeature[];
  readonly byName: ReadonlyMap<string, AnyFeature>;
  readonly featureNames: ReadonlySet<string>;
}

/**
 * Checks a table's features and orders them. Throws `store:copies` for a
 * feature from another copy of core, `feature:duplicate` for a second
 * feature with a name, `feature:missing` for a required feature that isn't
 * installed, and `feature:cycle` for features that require each other.
 */
export function resolveFeatures(features: readonly AnyFeature[]): ResolvedFeatures {
  const byName = new Map<string, AnyFeature>();
  for (const feature of features) {
    if (feature["~core"] !== brand) throw new Error(problem("store:copies"));
    if (byName.has(feature.name)) throw new Error(problem("feature:duplicate", feature.name));
    byName.set(feature.name, feature);
  }
  const ordered: AnyFeature[] = [];
  // False while a feature's requirements are being visited, true once the feature is placed.
  const placed = new Map<AnyFeature, boolean>();
  const visit = (feature: AnyFeature) => {
    const state = placed.get(feature);
    if (state) return;
    if (state === false) throw new Error(problem("feature:cycle", feature.name));
    placed.set(feature, false);
    for (const need of feature.def.requires?.() ?? []) {
      const required = byName.get(need.featureName);
      if (!required) throw new Error(problem("feature:missing", `${need.featureName} ${feature.name}`));
      visit(required);
    }
    placed.set(feature, true);
    ordered.push(feature);
  };
  features.forEach(visit);
  return { ordered, byName, featureNames: new Set(byName.keys()) };
}

/** Anything that knows which features it has, as a table does. */
export interface FeatureHost {
  readonly featureNames: ReadonlySet<string>;
}

/** The API key `hasFeature` adds for a feature: none when the feature has no API. */
type ApiEntry<TName extends string, TApi> = { readonly [K in TName as [TApi] extends [never] ? never : K]: TApi };

/**
 * Whether `table` has a feature. Given the factory, it narrows the table to
 * have the feature's API under its name. Given a name, the API is `unknown`.
 */
export function hasFeature<T extends FeatureHost, F extends AnyFeatureFactory>(
  table: T,
  feature: F,
): table is T & ApiEntry<F["featureName"], FeatureApiOf<ReturnType<F>>>;
export function hasFeature<T extends FeatureHost, N extends string>(table: T, name: N): table is T & { readonly [K in N]: unknown };
export function hasFeature(table: FeatureHost, feature: FeatureFactoryLike | string): boolean {
  return table.featureNames.has(typeof feature === "string" ? feature : feature.featureName);
}
