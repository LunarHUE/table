import {
  attachParts,
  findFeaturePart,
  footerValues,
  hasFeature,
  selectionScopeOf,
  type AnyFeaturePart,
  type CellApi,
  type ColumnView,
  type FooterApi,
  type HeaderApi,
  type HeaderCell,
  type NoPartApi,
  type Row,
  type SelectionApi,
  type Table,
} from "@lunarhue/table-core";
import { dynamic } from "@solidjs/web";
import { createComponent, createMemo, untrack, type Accessor, type Component, type Element as SolidElement } from "solid-js";
import { createSelectAll, type SelectionTable } from "./controls.js";
import type { AnyTable } from "./store.js";
import { createRowState, createTableMeta } from "./table.js";

// Rendering: `<Cell>`, `<Header>` and `<Footer>` render the component a
// column names for the slot, or its value or label when it names none. The
// component gets one prop, an object of getters, so `props.cell.value` in its
// JSX follows the value and nothing else. Parts on the column (`parts: [...]`)
// or attached with `defineCell` add their getters and commands through the
// shared helpers in `@lunarhue/table-core`.

export type { CellApi, FooterApi, HeaderApi, NoPartApi };

/**
 * Attaches feature parts to a cell, header or footer component, and returns
 * the component itself. `<Cell>` and `<Header>` then add what each part
 * gives: `defineCell(SelectCell, selectable())` gives the cell `selected`
 * and `toggleSelected`. The parts are kept beside the component, which is
 * never changed. A component that only shows its value needs no `defineCell`.
 */
export function defineCell<C extends (props: never) => unknown>(Component: C, ...attached: readonly AnyFeaturePart[]): C {
  return attachParts(Component, attached);
}

/** The slot component a column names, as Solid calls it. Columns type their slots `unknown`, since core knows no framework. */
const asComponent = <P extends object>(value: unknown): Component<P> | undefined =>
  // A column's slot holds a component when it holds a function.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  typeof value === "function" ? (value as Component<P>) : undefined;

/** Text for a value: ISO for a date, JSON for other objects, and empty for null, undefined and functions. Give the column a cell component to show it otherwise. */
const text = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return "";
};

/**
 * Renders reactive text. Solid inserts a function child as a text binding
 * that re-runs on its own; `Element` leaves functions out of its type.
 */
const textOf = (read: () => string): SolidElement =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  read as unknown as SolidElement;

/** Defines enumerable getters on `target`. */
const getters = (target: object, entries: Readonly<Record<string, () => unknown>>): void => {
  for (const key of Object.keys(entries)) {
    const get = entries[key];
    if (get) Object.defineProperty(target, key, { enumerable: true, get });
  }
};

const selectionOf = (table: AnyTable): SelectionApi | undefined =>
  // A table with the feature named "selection" has the selection API under that name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  hasFeature(table, "selection") ? (table.selection as SelectionApi) : undefined;

const isTrue = (part: unknown): boolean => part === true;

/** Props of `Cell`. */
export interface CellProps<TRow> {
  readonly table: Table<TRow>;
  readonly row: Row<TRow>;
  readonly column: ColumnView<TRow>;
}

/** The cell API for one component's parts. Getters read `props`, so it follows a new row or column. */
function cellApi(props: CellProps<unknown>, hasSelection: boolean): CellApi<unknown> {
  const table: AnyTable = props.table;
  const meta = createTableMeta(table);
  const api = {};
  getters(api, {
    value: () => props.column.column.getValue?.(props.row.original),
    row: () => props.row,
    column: () => props.column,
    table: () => props.table,
    meta,
  });
  const select = hasSelection ? selectionOf(table) : undefined;
  if (select) {
    const selected = createRowState(table, () => props.row.id, "selection", isTrue);
    getters(api, { selected });
    Object.defineProperty(api, "toggleSelected", {
      enumerable: true,
      value: () => select.toggle(untrack(() => props.row.id)),
    });
  }
  // The getters above define every member of `CellApi`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return api as CellApi<unknown>;
}

const ValueCell = (props: { readonly cell: CellApi<unknown> }): SolidElement => textOf(() => text(props.cell.value));

/**
 * Renders the column's `cell` component for a row, or the value as text when
 * the column has none. Pass the column from `createVisibleColumns` and the
 * row from `createTableRows`. A new row or column object updates the cell
 * in place; only a different component renders it again.
 */
export function Cell<TRow>(props: CellProps<TRow>): SolidElement {
  // The props are only read; `TRow` stays with the caller.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const own = props as unknown as CellProps<unknown>;
  const component = createMemo(() => own.column.column.cell);
  const columnParts = createMemo(() => own.column.column.parts);
  // The API is made inside the slot, so it goes with the component and column parts.
  const Slot = dynamic(() => {
    const render = asComponent<{ readonly cell: CellApi<unknown> }>(component()) ?? ValueCell;
    const hasSelection = findFeaturePart("selection", columnParts(), render) !== undefined;
    return () => createComponent(render, { cell: cellApi(own, hasSelection) });
  });
  return createComponent(Slot, {});
}

/** Props of `Header`. */
export interface HeaderProps<TRow> {
  readonly table: Table<TRow>;
  readonly header: HeaderCell<TRow>;
  /** The rows shown, for a select-all checkbox over the page. */
  readonly rows?: readonly Row<TRow>[];
}

const noRows: readonly Row<unknown>[] = Object.freeze([]);

/** The header API for one component's parts. */
function headerApi(props: HeaderProps<unknown>, selectionPart: AnyFeaturePart | undefined): HeaderApi {
  const table: AnyTable = props.table;
  const api = {};
  getters(api, {
    header: () => props.header,
    column: () => props.header.column,
    table: () => props.table,
    meta: createTableMeta(table),
  });
  const select = selectionPart ? selectionOf(table) : undefined;
  if (select && selectionPart) {
    // `selectionOf` found the selection API on the table.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const all = createSelectAll(table as SelectionTable, () => props.rows ?? noRows, { scope: selectionScopeOf(selectionPart) });
    getters(api, { checked: () => all().checked, indeterminate: () => all().indeterminate });
    Object.defineProperty(api, "toggle", { enumerable: true, value: untrack(all).toggle });
  }
  // The getters above define every member of `HeaderApi`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return api as HeaderApi;
}

const LabelHeader = (props: { readonly header: HeaderApi }): SolidElement => textOf(() => props.header.header.label);

/**
 * Renders a header cell: the column's `header` component, or the label when
 * the column has none or the cell is over a group.
 */
export function Header<TRow>(props: HeaderProps<TRow>): SolidElement {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const own = props as unknown as HeaderProps<unknown>;
  const component = createMemo(() => own.header.column?.column.header);
  const columnParts = createMemo(() => own.header.column?.column.parts);
  const Slot = dynamic(() => {
    const render = asComponent<{ readonly header: HeaderApi }>(component()) ?? LabelHeader;
    const selectionPart = findFeaturePart("selection", columnParts(), render);
    return () => createComponent(render, { header: headerApi(own, selectionPart) });
  });
  return createComponent(Slot, {});
}

/** Props of `Footer`. */
export interface FooterProps<TRow> {
  readonly table: Table<TRow>;
  readonly column: ColumnView<TRow>;
  /** The rows shown, whose values the footer sums up. */
  readonly rows: readonly Row<TRow>[];
}

/** Renders the column's `footer` component, or nothing when the column has none. */
export function Footer<TRow>(props: FooterProps<TRow>): SolidElement {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const own = props as unknown as FooterProps<unknown>;
  const component = createMemo(() => own.column.column.footer);
  const values: Accessor<readonly unknown[]> = createMemo(() => footerValues(own.column, own.rows));
  const api = {};
  getters(api, {
    column: () => own.column,
    rows: () => own.rows,
    values,
    table: () => own.table,
    meta: createTableMeta(untrack(() => own.table)),
  });
  const Slot = dynamic(() => asComponent<{ readonly footer: object }>(component()));
  return createComponent(Slot, { footer: api });
}
