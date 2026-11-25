import type { AnyFeaturePart } from "./feature.js";

// The shapes features and the store share: JSON for server requests, the
// row pipeline's phases, and the column and row types a stage sees. The
// store's own column and row types implement these.

/** A JSON scalar. */
export type JsonPrimitive = string | number | boolean | null;
/** A JSON array. */
export type JsonArray = readonly JsonValue[];
/** A JSON object. Use a type alias for a request shape: an interface has no index signature, so it doesn't fit. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
/** Any value `JSON.stringify` writes out unchanged. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * What a state change does to the rows. `"matching"` changes which rows
 * match or their order, as a new filter or sort does, so a page index
 * starts over. `"view"` changes how the same rows show, as a new page does.
 * `"none"` leaves the rows alone, as column visibility does.
 */
export type RowsEffect = "matching" | "view" | "none";

/** Where a row stage runs in the row pipeline. Stages run phase by phase, in this order. */
export type RowStagePhase = "filter" | "sort" | "flatten" | "window" | "decorate";

/** The row pipeline's phases, in the order they run. */
export const ROW_STAGE_PHASES: readonly RowStagePhase[] = ["filter", "sort", "flatten", "window", "decorate"];

/**
 * A column id inside a feature's state, as in a list of hidden columns.
 * Plain strings fit it, so feature code reads and writes it as a string. A
 * table's `initialState` narrows it to the table's column ids.
 */
export type ColumnId = string & { readonly "~columnId"?: "column" };

/**
 * The id of a sortable column inside a feature's state, as in a sort list.
 * Plain strings fit it. A table's `initialState` narrows it to the ids of the
 * columns with `sortable: true`.
 */
export type SortableColumnId = string & { readonly "~columnId"?: "sortable" };

/** Where a column sits: pinned to the start, scrolling in the center, or pinned to the end. */
export type ColumnZone = "start" | "center" | "end";

/** A column as features see it. */
export interface ColumnInfo {
  readonly id: string;
  readonly label?: string;
  /** The id of the group the column's header sits under. */
  readonly group?: string;
  readonly sortable?: boolean;
  readonly meta?: Readonly<Record<string, unknown>>;
  /** The feature parts attached to the column. */
  readonly parts?: readonly AnyFeaturePart[];
}

/** A column as it shows, after the column stages ran. */
export interface ColumnViewInfo extends ColumnInfo {
  readonly visible: boolean;
  readonly zone: ColumnZone;
  /** The column's place among the shown columns, from 0. */
  readonly order: number;
  /** The width in pixels, when something set one. */
  readonly size?: number;
}

/** A row as row stages see it: a data row, or the detail row under one. */
export interface RowLike<TRow = unknown> {
  readonly kind: "data" | "detail";
  readonly id: string;
  /** The row's place in the list the stage got, from 0. */
  readonly index: number;
  /** How deep the row sits in a tree, from 0. */
  readonly depth: number;
  /** The id of the row above this one in a tree, or null at the top. */
  readonly parentId: string | null;
  readonly original: TRow;
}
