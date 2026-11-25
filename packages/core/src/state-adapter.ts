import type { AnyTableDef, FeaturesOf, RequestOf, StateOf } from "./define-table.js";
import type { FeatureStateOf, InitialState } from "./feature.js";
import type { PaginationState } from "./features/pagination.js";
import type { SelectionState } from "./features/selection.js";
import type { SortEntry } from "./features/sorting.js";
import type { ColumnLayoutState, VisibilityState } from "./features/visibility.js";
import { stableStringify } from "./store.js";

// Unopinionated state resolution and adapter factories. Core knows nothing
// about URL query formats, routers or validation libraries: an app writes
// one shared adapter for its own conventions (Next.js + Zod, native nuqs,
// TanStack Router, etc.), and core handles defaults, feature normalization,
// request derivation and TypeScript inference.

/** Replaces branded `ColumnId` / `SortableColumnId` leaves with plain `string` so shared adapters need no casts. */
export type LooseColumnIds<T> = T extends string
  ? "~columnId" extends keyof T
    ? string
    : T
  : T extends (...args: never) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly LooseColumnIds<U>[]
      : T extends object
        ? { readonly [K in keyof T]: LooseColumnIds<T[K]> }
        : T;

/**
 * Input shape accepted for one feature's state before normalization:
 * unbranded column ids, and partial plain objects (such as `{ pageIndex: 1 }`
 * without `pageSize`, which inherits the table's default).
 */
export type LooseFeatureInput<T> = T extends readonly unknown[]
  ? LooseColumnIds<T>
  : T extends { readonly mode: string }
    ? LooseColumnIds<T>
    : T extends object
      ? Partial<LooseColumnIds<T>>
      : T;

/** Partial feature state accepted by `resolveTableState` for a table definition. */
export type PartialTableState<TDef extends AnyTableDef> = {
  readonly [F in FeaturesOf<TDef>[number] as [FeatureStateOf<F>] extends [never] ? never : F["name"]]?: LooseFeatureInput<
    FeatureStateOf<F>
  >;
};

/** Built-in feature state shapes (with unbranded column ids) used to auto-type shared adapters. */
export interface KnownFeatureStates {
  readonly sorting: readonly LooseColumnIds<SortEntry>[];
  readonly pagination: PaginationState;
  readonly filtering: Readonly<Record<string, unknown>>;
  readonly selection: SelectionState;
  readonly visibility: LooseColumnIds<VisibilityState>;
  readonly columnLayout: LooseColumnIds<ColumnLayoutState>;
}

/** Empty custom feature map default for `defineStateAdapter`. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export type NoCustomFeatures = Readonly<Record<never, never>>;

type StateForName<TName extends string, TCustom extends Readonly<Record<string, unknown>>> = TName extends keyof TCustom
  ? TCustom[TName]
  : TName extends keyof KnownFeatureStates
    ? KnownFeatureStates[TName]
    : unknown;

/** The state map a shared adapter's `serialize` receives, typed from its `features` list. */
export type AdapterFeatureState<
  TFeatures extends readonly string[],
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
> = {
  readonly [K in TFeatures[number]]?: StateForName<K, TCustom>;
};

/** The partial feature state a shared adapter's `parse` returns. */
export type AdapterParseResult<
  TFeatures extends readonly string[],
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
> = {
  readonly [K in TFeatures[number]]?: LooseFeatureInput<StateForName<K, TCustom>>;
};

/** Extra argument tuple for `adapter.resolve`, optional when `TExtra` allows `undefined` or is unused. */
export type AdapterExtraArgs<TExtra> = [TExtra] extends [void]
  ? []
  : [unknown] extends [TExtra]
    ? [extra?: TExtra]
    : undefined extends TExtra
      ? [extra?: TExtra]
      : [extra: TExtra];

/** What `resolveTableState` and `adapter.resolve` return. */
export interface ResolvedTableState<TDef extends AnyTableDef> {
  /** Every stateful feature's normalized state, with table defaults for anything omitted. */
  readonly state: StateOf<TDef>;
  /** What `store.getRequest()` returns for this state. */
  readonly request: RequestOf<TDef>;
  /** What `store.getRequestKey()` returns for this state. */
  readonly requestKey: string;
}

/** Configuration for `defineStateAdapter`. */
export interface StateAdapterConfig<
  TFeatures extends readonly string[],
  TInput,
  TOutput,
  TExtra = undefined,
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
> {
  /** The feature names this adapter reads and writes, such as `["sorting", "pagination", "filtering"] as const`. */
  readonly features: TFeatures;
  /** Reads external input (such as raw `searchParams`) into partial feature state. */
  parse(this: void, input: TInput, extra: TExtra): AdapterParseResult<TFeatures, TCustom>;
  /** Turns normalized feature state back into the app's target format (such as `URLSearchParams` or a router search object). */
  serialize(
    this: void,
    state: AdapterFeatureState<TFeatures, TCustom>,
    defaults: AdapterFeatureState<TFeatures, TCustom>,
  ): TOutput;
}

/** A reusable state adapter returned by `defineStateAdapter`. */
export interface StateAdapter<
  TFeatures extends readonly string[] = readonly string[],
  TInput = unknown,
  TOutput = unknown,
  TExtra = undefined,
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
> {
  readonly features: TFeatures;
  parse(this: void, input: TInput, ...extra: AdapterExtraArgs<TExtra>): AdapterParseResult<TFeatures, TCustom>;
  serialize(
    this: void,
    state: AdapterFeatureState<TFeatures, TCustom>,
    defaults: AdapterFeatureState<TFeatures, TCustom>,
  ): TOutput;
  /** Parses `input` and normalizes it against `def`, returning `{ state, request, requestKey }`. */
  resolve<TDef extends AnyTableDef>(
    this: void,
    def: TDef,
    input: TInput,
    ...extra: AdapterExtraArgs<TExtra>
  ): ResolvedTableState<TDef>;
}

type Values = Readonly<Record<string, unknown>>;

const isPlainObject = (value: unknown): value is Values =>
  typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

/** Merges a partial plain-object override onto its default, leaving arrays and discriminated unions intact. */
const mergeFeature = (base: unknown, override: unknown): unknown => {
  if (override === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  if ("mode" in base && "mode" in override && base.mode !== override.mode) return override;
  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(override)) {
    const val = override[key];
    if (val !== undefined || !(key in base)) merged[key] = val;
  }
  return merged;
};

/**
 * Resolves partial external state against `def`: applies `def.initialState`
 * and feature defaults, merges partial plain-object feature values, runs
 * every feature's `normalize`, and computes the matching `request` and
 * `requestKey`. Pure and RSC-safe — creates no store.
 */
export function resolveTableState<TDef extends AnyTableDef>(
  def: TDef,
  partial?: PartialTableState<TDef>,
): ResolvedTableState<TDef> {
  const ordered = def.resolvedFeatures.ordered;
  // The definition's initialState and partial input are indexed by feature name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const given = def.initialState as Values;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const overrides = partial as Values | undefined;

  const state: Record<string, unknown> = {};
  for (const feature of ordered) {
    const seam = feature.def.state;
    if (!seam) continue;
    let base = given[feature.name];
    if (base === undefined) {
      // A state that is itself a function must come from the function form, so a function is always the maker.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      base = typeof seam.initial === "function" ? (seam.initial as InitialState<unknown, unknown>)(feature.options) : seam.initial;
    }
    const fix = seam.normalize;
    const normalizedBase = fix ? fix(base, def.columns) : base;
    const override = overrides?.[feature.name];
    if (override === undefined) {
      state[feature.name] = normalizedBase;
    } else {
      const merged = mergeFeature(normalizedBase, override);
      state[feature.name] = fix ? fix(merged, def.columns) : merged;
    }
  }

  const request: Record<string, unknown> = {};
  for (const feature of ordered) {
    const make = feature.def.request;
    if (!make) continue;
    request[feature.name] = make(state[feature.name], feature.options);
  }
  const frozenRequest = Object.freeze(request);
  const requestKey = stableStringify(frozenRequest);

  return Object.freeze({
    // Every stateful feature has been populated and normalized for `def`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    state: Object.freeze(state) as StateOf<TDef>,
    // Every request feature has been computed for `def`.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    request: frozenRequest as RequestOf<TDef>,
    requestKey,
  });
}

/**
 * Defines a reusable, framework-free state adapter for your app's own URL or
 * persistence conventions. Core types `state` and `defaults` from `features`
 * (using built-in feature shapes automatically, or custom ones via the
 * optional type parameter) while leaving parsing and serialization entirely
 * to your app.
 */
export function defineStateAdapter<
  const TFeatures extends readonly string[],
  TInput,
  TOutput,
  TExtra = undefined,
  TCustom extends Readonly<Record<string, unknown>> = NoCustomFeatures,
>(
  config: StateAdapterConfig<TFeatures, TInput, TOutput, TExtra, TCustom>,
): StateAdapter<TFeatures, TInput, TOutput, TExtra, TCustom> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const features = Object.freeze([...config.features]) as unknown as TFeatures;
  const parse = (input: TInput, ...extra: AdapterExtraArgs<TExtra>) =>
    // `extra[0]` is `TExtra` when supplied and `undefined` otherwise.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    config.parse(input, extra[0] as TExtra);

  const resolve = <TDef extends AnyTableDef>(
    def: TDef,
    input: TInput,
    ...extra: AdapterExtraArgs<TExtra>
  ): ResolvedTableState<TDef> => {
    const parsed = parse(input, ...extra);
    // Keep only features the adapter declared so stray keys from `parse` can't override unrelated features.
    const filtered: Record<string, unknown> = {};
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const raw = parsed as Values;
    for (const name of features) {
      if (raw[name] !== undefined) filtered[name] = raw[name];
    }
    // `filtered` holds partial values for the adapter's declared features; `resolveTableState` ignores any `def` lacks.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return resolveTableState(def, filtered as PartialTableState<TDef>);
  };

  return Object.freeze({
    features,
    parse,
    serialize: config.serialize,
    resolve,
  });
}
