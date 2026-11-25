import type { ColumnInfo } from "./contract.js";
import type { AnyFeaturePart } from "./feature.js";

// Columns are plain frozen objects. Nothing here reads a property of a
// `cell`, `header` or `footer` value: in a React Server Component graph those
// are client references, proxies that throw on any property read. Column
// helpers only copy them.

/** What `getRowId` gets besides the row. */
export interface RowIdContext {
  /** The row's place among its siblings, from 0. */
  readonly index: number;
  /** The id of the row above this one in a tree, or null at the top. */
  readonly parentId: string | null;
}

/** A column's free-form metadata. */
export type ColumnMeta = Readonly<Record<string, unknown>>;

/**
 * A column of rows `TRow`. `TRow` only appears where the column takes a row,
 * so a column of `unknown` rows, such as one from `defineColumn`, fits a
 * table of any rows. The `~` members hold types only and are never set.
 */
export interface Column<
  TRow = unknown,
  TId extends string = string,
  TValue = unknown,
  TSortable extends boolean = boolean,
  TParts extends readonly AnyFeaturePart[] = readonly AnyFeaturePart[],
  TMeta extends ColumnMeta = ColumnMeta,
> extends ColumnInfo {
  readonly id: TId;
  readonly sortable?: TSortable;
  readonly parts?: TParts;
  readonly meta?: TMeta;
  /** Reads the column's value from a row. Columns that show no row data, such as row actions, have none. */
  readonly getValue?: (row: TRow) => TValue;
  /** The component for the column's cells. Adapters give it a type. */
  readonly cell?: unknown;
  /** The component for the column's header. Adapters give it a type. */
  readonly header?: unknown;
  /** The component for the column's footer. Adapters give it a type. */
  readonly footer?: unknown;
  readonly "~row"?: (row: TRow) => void;
  readonly "~value"?: TValue;
}

/**
 * A column of any id, value and parts for rows `TRow`. The default, `never`,
 * takes columns of any rows.
 */
export type AnyColumn<TRow = never> = Column<TRow>;

/** What a column helper takes besides the id and the accessor. */
export interface ColumnOptions<
  TSortable extends boolean = boolean,
  TParts extends readonly AnyFeaturePart[] = readonly AnyFeaturePart[],
  TMeta extends ColumnMeta = ColumnMeta,
> {
  readonly label?: string;
  /** The id of the group the column's header sits under. */
  readonly group?: string;
  /** Set to `true` to let sorting features sort by this column. */
  readonly sortable?: TSortable;
  /** Feature parts for the column, such as `selectable()`. The table must install their features. */
  readonly parts?: TParts;
  readonly meta?: TMeta;
  readonly cell?: unknown;
  readonly header?: unknown;
  readonly footer?: unknown;
}

/** The column helpers `columns: (col) => [...]` gets, typed for rows `TRow`. */
export interface ColumnBuilder<TRow> {
  /** A column that shows `row[field]`. Its id is `field`. */
  key<
    const TField extends keyof TRow & string,
    const TSortable extends boolean = false,
    const TParts extends readonly AnyFeaturePart[] = readonly [],
    const TMeta extends ColumnMeta = ColumnMeta,
  >(
    this: void,
    field: TField,
    options?: ColumnOptions<TSortable, TParts, TMeta>,
  ): Column<TRow, TField, TRow[TField], NoInfer<TSortable>, NoInfer<TParts>, NoInfer<TMeta>>;
  /** A column that shows what `getValue` returns for a row. */
  accessor<
    const TId extends string,
    TValue,
    const TSortable extends boolean = false,
    const TParts extends readonly AnyFeaturePart[] = readonly [],
    const TMeta extends ColumnMeta = ColumnMeta,
  >(
    this: void,
    id: TId,
    getValue: (row: TRow) => TValue,
    options?: ColumnOptions<TSortable, TParts, TMeta>,
  ): Column<TRow, TId, TValue, NoInfer<TSortable>, NoInfer<TParts>, NoInfer<TMeta>>;
  /** A column with no value, such as row actions, typed for this table's rows. */
  custom<
    const TId extends string,
    const TSortable extends boolean = false,
    const TParts extends readonly AnyFeaturePart[] = readonly [],
    const TMeta extends ColumnMeta = ColumnMeta,
  >(
    this: void,
    id: TId,
    options?: ColumnOptions<TSortable, TParts, TMeta>,
  ): Column<TRow, TId, undefined, NoInfer<TSortable>, NoInfer<TParts>, NoInfer<TMeta>>;
}

/** Makes the column helpers for rows `TRow`. */
export function columnBuilder<TRow>(): ColumnBuilder<TRow> {
  return {
    key: (field, options) => Object.freeze({ ...options, id: field, getValue: (row: TRow) => row[field] }),
    accessor: (id, getValue, options) => Object.freeze({ ...options, id, getValue }),
    custom: (id, options) => Object.freeze({ ...options, id }),
  };
}

/**
 * A column that fits a table of any rows, such as a selection checkbox
 * column shared by every table in an app. It has no value. A table rejects
 * it, at compile time and when made, when it lacks a feature its `parts`
 * belong to.
 */
export function defineColumn<
  const TId extends string,
  const TSortable extends boolean = false,
  const TParts extends readonly AnyFeaturePart[] = readonly [],
  const TMeta extends ColumnMeta = ColumnMeta,
>(id: TId, options?: ColumnOptions<TSortable, TParts, TMeta>): Column<unknown, TId, undefined, NoInfer<TSortable>, NoInfer<TParts>, NoInfer<TMeta>> {
  return Object.freeze({ ...options, id });
}

/**
 * Defines columns for rows `TRow` outside a table, to share them between
 * tables or build them in another file:
 * `const userColumns = defineColumns<User>()((col) => [col.key("name")])`.
 */
export function defineColumns<TRow>() {
  return <const TColumns extends readonly AnyColumn<TRow>[]>(build: (col: ColumnBuilder<TRow>) => TColumns): TColumns =>
    Object.freeze(build(columnBuilder<TRow>()));
}

/**
 * Binds some of a component's props: `withProps(DateCell, { format: "short" })`
 * is a component that takes the rest, and may still override the bound ones.
 * It never reads a property of `Component`, so a client reference works.
 */
export function withProps<TProps extends object, TBound extends Partial<TProps>, TResult>(
  Component: (props: TProps) => TResult,
  bound: TBound,
): (props: Omit<TProps, keyof TBound> & Partial<TBound>) => TResult {
  // The bound props fill in what `props` leaves out, which TypeScript can't follow through `Omit`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (props) => Component({ ...bound, ...props } as unknown as TProps);
}
