import type { ColumnView, HeaderCell } from "./column-pipeline.js";
import type { Table } from "./define-table.js";
import type { AnyFeaturePart } from "./feature.js";
import type { SelectionScope } from "./features/selection.js";
import type { Row } from "./row-pipeline.js";

// Shared slot types and feature-part attachment helpers used by both the
// React and Solid adapters so cell, header and footer APIs stay identical
// across frameworks. Nothing here imports any framework or touches properties
// on components, so React Server Component client references pass through
// untouched.

/** No part API: what a slot component gets when it has no feature parts. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export type NoPartApi = Record<never, never>;

/**
 * What a cell component receives as `cell`. `TValue` is the column's value,
 * `TRow` the table's row type, and `TPartApi` what attached feature parts
 * add (such as `SelectionCellApi` for `selectable()`).
 */
export type CellApi<TValue, TRow = unknown, TPartApi = NoPartApi> = {
  readonly value: TValue;
  readonly row: Row<TRow>;
  readonly column: ColumnView<TRow>;
  readonly table: Table<TRow>;
  readonly meta: Readonly<Record<string, unknown>>;
} & TPartApi;

/** What a header component receives as `header`. `column` is undefined over a group. */
export type HeaderApi<TRow = unknown, TPartApi = NoPartApi> = {
  readonly header: HeaderCell<TRow>;
  readonly column: ColumnView<TRow> | undefined;
  readonly table: Table<TRow>;
  readonly meta: Readonly<Record<string, unknown>>;
} & TPartApi;

/** What a footer component receives as `footer`: the column, shown rows, and their data values. */
export type FooterApi<TValue, TRow = unknown, TPartApi = NoPartApi> = {
  readonly column: ColumnView<TRow>;
  readonly rows: readonly Row<TRow>[];
  /** The column's value for each data row in `rows`. */
  readonly values: readonly TValue[];
  readonly table: Table<TRow>;
  readonly meta: Readonly<Record<string, unknown>>;
} & TPartApi;

/** Parts attached to slot components via `defineCell`. Kept out-of-band so components and RSC client references are never mutated or probed. */
const componentParts = new WeakMap<object, readonly AnyFeaturePart[]>();
const noParts: readonly AnyFeaturePart[] = Object.freeze([]);

/** Attaches feature parts to a slot component without reading or mutating any property on it. */
export function attachParts<TComponent extends object>(component: TComponent, parts: readonly AnyFeaturePart[]): TComponent {
  componentParts.set(component, Object.freeze([...parts]));
  return component;
}

/** Returns the feature parts attached to `component`, or an empty list. */
export const partsOf = (component: unknown): readonly AnyFeaturePart[] =>
  (typeof component === "function" || (typeof component === "object" && component !== null) ? componentParts.get(component) : undefined) ??
  noParts;

/**
 * Finds the first feature part named `feature` across a column's `parts`
 * and its slot component's `defineCell` parts (column parts take precedence).
 */
export const findFeaturePart = (
  feature: string,
  columnParts: readonly AnyFeaturePart[] | undefined,
  component: unknown,
): AnyFeaturePart | undefined => {
  if (columnParts) {
    for (const part of columnParts) {
      if (part.feature === feature) return part;
    }
  }
  for (const part of partsOf(component)) {
    if (part.feature === feature) return part;
  }
  return undefined;
};

/** Reads the selection scope (`"page"` or `"matching"`) from a `selectable()` feature part. */
export const selectionScopeOf = (part: AnyFeaturePart | undefined): SelectionScope => {
  const config = part?.config;
  return typeof config === "object" && config !== null && "scope" in config && config.scope === "matching" ? "matching" : "page";
};

/** Extracts a column's values for every data row in `rows`, for `<Footer>` components. */
export const footerValues = <TRow>(column: ColumnView<TRow>, rows: readonly Row<TRow>[]): readonly unknown[] => {
  const getValue = column.column.getValue;
  const out: unknown[] = [];
  for (const row of rows) {
    if (row.kind === "data") out.push(getValue?.(row.original));
  }
  return out;
};
