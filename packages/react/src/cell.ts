import {
  hasFeature,
  type AnyFeaturePart,
  type ColumnView,
  type HeaderCell,
  type Row,
  type SelectionApi,
  type SelectionScope,
  type Table,
} from "@lunarhue/table-core";
import { createElement, useMemo, type ComponentType, type ReactNode } from "react";
import { partsOf } from "./define-cell.js";
import { useSource } from "./select.js";
import { keyedSource, metaSource, noSource, storeOf, type AnyTable } from "./sources.js";
import { useSelectAllOf } from "./view-hooks.js";

/** Props for `<Cell>`. */
export interface CellProps<TRow> {
  readonly table: Table<TRow>;
  readonly row: Row<TRow>;
  readonly column: ColumnView<TRow>;
}

/** Props for `<Header>`. */
export interface HeaderProps<TRow> {
  readonly table: Table<TRow>;
  readonly header: HeaderCell<TRow>;
  /** The rows on screen, for a select-all checkbox in the header. Leave it out while there are none, as in a skeleton. */
  readonly rows?: readonly Row<TRow>[];
}

/** The selection part among a column's parts and its component's, if any. */
const selectionPart = (parts: readonly AnyFeaturePart[] | undefined, component: unknown): AnyFeaturePart | undefined =>
  [...(parts ?? []), ...partsOf(component)].find((part) => part.feature === "selection");

/** The scope a `selectable()` part gives its header checkbox. */
const scopeOf = (part: AnyFeaturePart | undefined): SelectionScope => {
  const config = part?.config;
  return typeof config === "object" && config !== null && "scope" in config && config.scope === "matching" ? "matching" : "page";
};

/** The table's selection commands, when it has selection. */
const selectionApi = (table: AnyTable): SelectionApi | undefined =>
  // The selection feature puts a `SelectionApi` under its name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  hasFeature(table, "selection") ? (table.selection as SelectionApi) : undefined;

/** What a column holds as its cell, header or footer component, as React renders it. */
type PartComponent<P> = ComponentType<P>;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const asComponent = <P>(component: unknown): PartComponent<P> => component as PartComponent<P>;

/** What a column without a cell component shows: strings, numbers, booleans and bigints as text, anything else as nothing. */
const plain = (value: unknown): ReactNode =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" ? String(value) : null;

const noRows: readonly Row<unknown>[] = Object.freeze([]);

/**
 * Renders one body cell: the column's `cell` component with a `CellApi`, or
 * the value as text when the column has none. When the column or the
 * component has a `selectable()` part, the cell gets `selected` and
 * `toggleSelected` too, and re-renders only when this row's selection
 * changes. Without one it subscribes to no selection state at all.
 */
export function Cell<TRow>(props: CellProps<TRow>): ReactNode {
  const { table, row, column } = props;
  const store = storeOf(table);
  const component = column.column.cell;
  const selection = selectionPart(column.column.parts, component) === undefined ? undefined : selectionApi(table);
  const selected = useSource(selection ? keyedSource(store, "row", "selection", row.id) : noSource) === true;
  const meta = useSource(metaSource(store));
  const value = column.column.getValue?.(row.original);
  const cell = useMemo(() => {
    const base = { value, row, column, table, meta };
    if (!selection) return base;
    return { ...base, selected, toggleSelected: () => selection.toggle(row.id) };
  }, [value, row, column, table, meta, selection, selected]);
  if (component === undefined || component === null) return plain(value);
  return createElement(asComponent<{ readonly cell: typeof cell }>(component), { cell });
}

/**
 * Renders one header cell: the column's `header` component with a
 * `HeaderApi`, or the header's label when it has none, as over a group.
 * With a `selectable()` part the header gets `checked`, `indeterminate` and
 * `toggle` for the rows in `rows`, or for every matching row when the part's
 * scope is `"matching"`.
 */
export function Header<TRow>(props: HeaderProps<TRow>): ReactNode {
  const { table, header, rows } = props;
  const store = storeOf(table);
  const column = header.column;
  const component = column?.column.header;
  const part = selectionPart(column?.column.parts, component);
  const selection = part === undefined ? undefined : selectionApi(table);
  const selectAll = useSelectAllOf(store, selection, rows ?? noRows, scopeOf(part));
  const meta = useSource(metaSource(store));
  const api = useMemo(() => {
    const base = { header, column, table, meta };
    return selection ? { ...base, ...selectAll } : base;
  }, [header, column, table, meta, selection, selectAll]);
  if (component === undefined || component === null) return header.label;
  return createElement(asComponent<{ readonly header: typeof api }>(component), { header: api });
}
