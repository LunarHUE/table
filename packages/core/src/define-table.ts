import { columnBuilder, type AnyColumn, type ColumnBuilder, type RowIdContext } from "./column.js";
import type { SortableColumnId } from "./contract.js";
import {
  resolveFeatures,
  type AnyFeature,
  type FeatureApiMap,
  type FeatureStateOf,
  type MissingRequirements,
  type ResolvedFeatures,
  type ServerRequestMap,
} from "./feature.js";
import { problem } from "./problem.js";

// A table definition: rows, columns, features and starting state. It runs
// no React and reads no component, so a server component can import the
// same definition as the client. The types check that every feature a
// feature or column part needs is installed, and narrow column ids in
// `initialState` to the table's columns.

/**
 * Marks a feature whose state has no usable default, such as filters typed
 * by the app with required keys. A table with it must set the feature's
 * slice in `initialState`. Give it as the factory's return type:
 * `function filtering<T>(): NeedsInitialState<Feature<"filtering", ...>>`.
 */
export type NeedsInitialState<TFeature extends AnyFeature> = TFeature & { readonly "~needsInitialState"?: true };

/** The ids of a list of columns. */
export type ColumnIds<TColumns extends readonly AnyColumn[]> = TColumns[number]["id"];

/** The ids of the columns in a list that have `sortable: true`. */
export type SortableColumnIds<TColumns extends readonly AnyColumn[]> = TColumns[number] extends infer C
  ? C extends { readonly id: infer I; readonly sortable?: infer S }
    ? true extends S
      ? I
      : never
    : never
  : never;

/**
 * `T` with its `ColumnId` and `SortableColumnId` brands replaced by the
 * column ids `TColumnId` and the sortable ones `TSortableId`.
 */
export type WithColumnIds<T, TColumnId extends string, TSortableId extends string> = T extends string
  ? "~columnId" extends keyof T
    ? T extends SortableColumnId
      ? TSortableId
      : TColumnId
    : T
  : T extends (...args: never) => unknown
    ? T
    : T extends object
      ? { [K in keyof T]: WithColumnIds<T[K], TColumnId, TSortableId> }
      : T;

type NeedsInitial<F> = "~needsInitialState" extends keyof F ? true : false;
type SliceOf<F, TColumns extends readonly AnyColumn[]> = WithColumnIds<
  FeatureStateOf<F>,
  ColumnIds<TColumns>,
  SortableColumnIds<TColumns>
>;

/**
 * What `initialState` takes for a feature list and columns: each feature's
 * state by name, with column ids narrowed to the columns. A slice is
 * optional unless its feature is marked `NeedsInitialState`.
 */
export type InitialStateFor<TFeatures extends readonly AnyFeature[], TColumns extends readonly AnyColumn[]> = {
  readonly [F in TFeatures[number] as [FeatureStateOf<F>] extends [never]
    ? never
    : NeedsInitial<F> extends true
      ? never
      : F["name"]]?: SliceOf<F, TColumns>;
} & {
  readonly [F in TFeatures[number] as NeedsInitial<F> extends true ? F["name"] : never]: SliceOf<F, TColumns>;
};

/** A table definition, as `defineTable` returns it. */
export interface TableDef<
  TRow,
  TColumns extends readonly AnyColumn<TRow>[] = readonly AnyColumn<TRow>[],
  TFeatures extends readonly AnyFeature[] = readonly AnyFeature[],
> {
  readonly getRowId: (row: TRow, ctx: RowIdContext) => string;
  readonly columns: TColumns;
  readonly columnsById: ReadonlyMap<string, TColumns[number]>;
  /** The features, in the order given. */
  readonly features: TFeatures;
  /** The features, checked and in the order their seams run. */
  readonly resolvedFeatures: ResolvedFeatures;
  /** The starting state of the slices the table sets, by feature name. Features start the rest from their own `initial`. */
  readonly initialState: InitialStateFor<TFeatures, TColumns>;
}

/** A table definition of any columns and features for rows `TRow`. The default, `never`, takes definitions of any rows. */
export type AnyTableDef<TRow = never> = TableDef<TRow>;

/** The parameter type where a check failed: the config doesn't fit it, and the error names the missing feature. */
interface MissingFeature<TName extends string> {
  readonly "~missingFeature": TName;
}

type PartFeatureNames<TColumns extends readonly AnyColumn[]> = TColumns[number] extends infer C
  ? C extends { readonly parts?: infer P extends readonly { readonly feature: string }[] }
    ? P[number]["feature"]
    : never
  : never;

/** The features the columns' parts belong to and the list lacks. `never` for columns built at runtime, which `defineTable` checks when it runs. */
type MissingPartFeatures<TColumns extends readonly AnyColumn[], TFeatures extends readonly AnyFeature[]> =
  string extends PartFeatureNames<TColumns> ? never : Exclude<PartFeatureNames<TColumns>, TFeatures[number]["name"]>;

type Check<TMissing, TKey extends string> = [TMissing] extends [never]
  ? unknown
  : string extends TMissing
    ? unknown
    : { readonly [K in TKey]: MissingFeature<TMissing & string> };

/** What `defineTable` takes. */
export interface TableConfig<TRow, TColumns extends readonly AnyColumn<TRow>[], TFeatures extends readonly AnyFeature[]> {
  /** The row's id, unique in the table. Selection and the like keep it, so it must not change while the row lives. */
  readonly getRowId: (row: TRow, ctx: RowIdContext) => string;
  /** The columns, or a function of the column helpers that returns them. */
  readonly columns: TColumns | ((col: ColumnBuilder<TRow>) => TColumns);
  readonly features?: TFeatures;
}

/** The `initialState` field: required when a feature is marked `NeedsInitialState`. */
type InitialStateField<TState> = {} extends TState ? { readonly initialState?: TState } : { readonly initialState: TState };

/**
 * Defines a table of rows `TRow`. Call it twice, the first time with the
 * row type: `defineTable<User>()({ getRowId, columns, features })`.
 *
 * Throws `column:duplicate` for two columns with an id, `feature:missing`
 * for a feature a column part or another feature needs and the table
 * lacks, `feature:unknown` for an `initialState` key that names no feature,
 * and what `resolveFeatures` throws.
 */
export function defineTable<TRow>() {
  return <const TColumns extends readonly AnyColumn<TRow>[], const TFeatures extends readonly AnyFeature[] = readonly []>(
    config: TableConfig<TRow, TColumns, TFeatures> &
      InitialStateField<NoInfer<InitialStateFor<TFeatures, TColumns>>> &
      NoInfer<Check<MissingRequirements<TFeatures>, "features"> & Check<MissingPartFeatures<TColumns, TFeatures>, "columns">>,
  ): TableDef<TRow, TColumns, TFeatures> => {
    const given = config.columns;
    const columns = Object.freeze(typeof given === "function" ? given(columnBuilder<TRow>()) : [...given]);
    // An empty list is a list of any features, and `features` holds the list given otherwise.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const features = Object.freeze([...(config.features ?? [])]) as unknown as TFeatures;
    const resolvedFeatures = resolveFeatures(features);
    const columnsById = new Map<string, TColumns[number]>();
    for (const column of columns) {
      if (columnsById.has(column.id)) throw new Error(problem("column:duplicate", column.id));
      columnsById.set(column.id, column);
      for (const { feature } of column.parts ?? []) {
        if (!resolvedFeatures.featureNames.has(feature)) throw new Error(problem("feature:missing", feature));
      }
    }
    const initialState = Object.freeze({ ...config.initialState });
    for (const name of Object.keys(initialState)) {
      if (!resolvedFeatures.featureNames.has(name)) throw new Error(problem("feature:unknown", name));
    }
    return Object.freeze({
      getRowId: config.getRowId,
      // A copy of the columns given, so it has their type.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      columns: columns as unknown as TColumns,
      columnsById,
      features,
      resolvedFeatures,
      // The `initialState` given, or none when the type allows none.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      initialState: initialState as InitialStateFor<TFeatures, TColumns>,
    });
  };
}

/** The constraint the helpers below take: any table definition. */
type DefLike = AnyTableDef;

/** The row type of a table definition. */
export type RowOf<TDef extends DefLike> = TDef extends { readonly getRowId: (row: infer R, ctx: RowIdContext) => string } ? R : never;
/** The columns of a table definition, as a tuple when they were written out. */
export type ColumnsOf<TDef extends DefLike> = TDef["columns"];
/** The features of a table definition. */
export type FeaturesOf<TDef extends DefLike> = TDef["features"];
/** The column ids of a table definition. */
export type ColumnIdOf<TDef extends DefLike> = ColumnIds<TDef["columns"]>;
/** The ids of a table definition's columns that have `sortable: true`. */
export type SortableColumnIdOf<TDef extends DefLike> = SortableColumnIds<TDef["columns"]>;
/** A table's full state, by feature name, with column ids narrowed to its columns. */
export type StateOf<TDef extends DefLike> = WithColumnIds<
  {
    readonly [F in TDef["features"][number] as [FeatureStateOf<F>] extends [never] ? never : F["name"]]: FeatureStateOf<F>;
  },
  ColumnIdOf<TDef>,
  SortableColumnIdOf<TDef>
>;
/** What a table sends the server: the requests of its features that have a `request` seam, by name. */
export type RequestOf<TDef extends DefLike> = WithColumnIds<
  ServerRequestMap<TDef["features"]>,
  ColumnIdOf<TDef>,
  SortableColumnIdOf<TDef>
>;

/**
 * A table of rows `TRow` with at least the features `TFeatures`. A table
 * with more features fits it, so a generic component can take
 * `Table<TRow, readonly [Pagination]>` and get any table that has
 * pagination. `TDef` is the definition, when it is known.
 */
export type Table<
  TRow,
  TFeatures extends readonly AnyFeature[] = readonly [],
  TDef extends AnyTableDef = AnyTableDef<TRow>,
> = {
  readonly def: TDef;
  readonly featureNames: ReadonlySet<string>;
  readonly meta: Readonly<Record<string, unknown>>;
} & FeatureApiMap<TFeatures>;

/** The table a definition makes. */
export type TableOf<TDef extends DefLike> = Table<RowOf<TDef>, FeaturesOf<TDef>, TDef>;
