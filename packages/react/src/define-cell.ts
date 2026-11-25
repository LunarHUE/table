import type { AnyFeaturePart, ColumnView, HeaderCell, Row, Table } from "@lunarhue/table-core";
import type { ReactNode } from "react";

// The plain objects cell, header and footer components get, and `defineCell`.
// Nothing here uses a hook, so the server entry exports it too.

/** No part API: what a component gets from parts when it has none. Intersecting with it adds nothing. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export type NoPartApi = Record<never, never>;

/**
 * What a cell component gets as its `cell` prop. `TValue` is the column's
 * value, `TRow` the table's rows and `TPartApi` what the parts on the column
 * or the component add, such as `SelectionCellApi` for `selectable()`. The
 * object keeps its identity until one of its fields changes.
 */
export type CellApi<TValue, TRow = unknown, TPartApi = NoPartApi> = {
  readonly value: TValue;
  readonly row: Row<TRow>;
  readonly column: ColumnView<TRow>;
  readonly table: Table<TRow>;
  /** The table's `meta`, from `useTable`'s options. */
  readonly meta: Readonly<Record<string, unknown>>;
} & TPartApi;

/** What a header component gets as its `header` prop. `column` is undefined over a group. */
export type HeaderApi<TRow = unknown, TPartApi = NoPartApi> = {
  readonly header: HeaderCell<TRow>;
  readonly column: ColumnView<TRow> | undefined;
  readonly table: Table<TRow>;
  readonly meta: Readonly<Record<string, unknown>>;
} & TPartApi;

/** What a footer component gets as its `footer` prop. */
export type FooterApi<TValue, TRow = unknown, TPartApi = NoPartApi> = {
  readonly value: TValue;
  readonly column: ColumnView<TRow>;
  readonly table: Table<TRow>;
  readonly meta: Readonly<Record<string, unknown>>;
} & TPartApi;

/** The parts each component was given by `defineCell`. Kept here so the component itself is never changed. */
const componentParts = new WeakMap<object, readonly AnyFeaturePart[]>();

/**
 * Attaches feature parts to a cell or header component, for every column it
 * renders in: `defineCell(SelectCell, selectable())`. `<Cell>` and `<Header>`
 * then subscribe to what the parts need and add their API to the component's
 * prop. Returns the component itself, untouched; a second call replaces the
 * parts. It reads no property of the component, so a client reference from
 * a server component works.
 */
export function defineCell<TComponent extends (...args: never) => ReactNode>(
  component: TComponent,
  ...parts: readonly AnyFeaturePart[]
): TComponent {
  componentParts.set(component, Object.freeze([...parts]));
  return component;
}

const noParts: readonly AnyFeaturePart[] = Object.freeze([]);

/** The parts `defineCell` gave a component. */
export const partsOf = (component: unknown): readonly AnyFeaturePart[] =>
  (typeof component === "function" || (typeof component === "object" && component !== null) ? componentParts.get(component) : undefined) ??
  noParts;
