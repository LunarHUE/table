import {
  hasFeature,
  type AnyFeaturePart,
  type ColumnView,
  type HeaderCell,
  type Row,
  type SelectableConfig,
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
// JSX follows the value and nothing else. Parts attached with `defineCell`
// add their getters and commands, and only cells whose component asks for a
// part subscribe to its state.

type Meta = Readonly<Record<string, unknown>>;

/** What every slot's component gets about the table. */
interface SlotApi {
  /** The table, for its feature commands. */
  readonly table: AnyTable;
  /** The table's `meta`, following `createTable`'s options. */
  readonly meta: Meta;
}

/**
 * The `cell` prop of a cell component. `TPartApi` is what the parts given to
 * `defineCell` add, such as `SelectionCellApi` from `selectable()`.
 */
// `Record<never, never>` adds no members: a cell with no parts gets the base API.
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export type CellApi<TValue, TRow = unknown, TPartApi = Record<never, never>> = SlotApi & {
  /** What the column's `getValue` returns for the row. */
  readonly value: TValue;
  readonly row: Row<TRow>;
  readonly column: ColumnView<TRow>;
} & TPartApi;

/**
 * The `header` prop of a header component. `column` is undefined over a
 * group. `TPartApi` is what the parts add, such as `SelectionHeaderApi`
 * from `selectable()`.
 */
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export type HeaderApi<TRow = unknown, TPartApi = Record<never, never>> = SlotApi & {
  readonly header: HeaderCell<TRow>;
  readonly column: ColumnView<TRow> | undefined;
} & TPartApi;

/** The `footer` prop of a footer component: the column, and its values in the rows shown, for totals. */
// oxlint-disable-next-line typescript/no-generated-empty-object-type
export type FooterApi<TValue, TRow = unknown, TPartApi = Record<never, never>> = SlotApi & {
  readonly column: ColumnView<TRow>;
  readonly rows: readonly Row<TRow>[];
  /** The column's value for each data row in `rows`. */
  readonly values: readonly TValue[];
} & TPartApi;

const parts = new WeakMap<object, readonly AnyFeaturePart[]>();

/**
 * Attaches feature parts to a cell, header or footer component, and returns
 * the component itself. `<Cell>` then adds what each part gives:
 * `defineCell(SelectCell, selectable())` gives the cell `selected` and
 * `toggleSelected`. The parts are kept beside the component, which is never
 * changed. A component that only shows its value needs no `defineCell`.
 */
export function defineCell<C extends (props: never) => unknown>(Component: C, ...attached: readonly AnyFeaturePart[]): C {
  parts.set(Component, Object.freeze([...attached]));
  return Component;
}

const partsOf = (component: unknown): readonly AnyFeaturePart[] =>
  (typeof component === "function" ? parts.get(component) : undefined) ?? [];

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
function cellApi(props: CellProps<unknown>, attached: readonly AnyFeaturePart[]): CellApi<unknown> {
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
  const select = selectionOf(table);
  if (select && attached.some((part) => part.feature === "selection")) {
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
  // The API is made inside the slot, so it goes with the component that asked for its parts.
  const Slot = dynamic(() => {
    const render = asComponent<{ readonly cell: CellApi<unknown> }>(component()) ?? ValueCell;
    const attached = partsOf(render);
    return () => createComponent(render, { cell: cellApi(own, attached) });
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
function headerApi(props: HeaderProps<unknown>, attached: readonly AnyFeaturePart[]): HeaderApi {
  const table: AnyTable = props.table;
  const api = {};
  getters(api, {
    header: () => props.header,
    column: () => props.header.column,
    table: () => props.table,
    meta: createTableMeta(table),
  });
  const part = attached.find((item) => item.feature === "selection");
  const select = selectionOf(table);
  if (select && part) {
    // `selectable()` makes the selection part, with this config.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const config = part.config as SelectableConfig;
    // `selectionOf` found the selection API on the table.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const all = createSelectAll(table as SelectionTable, () => props.rows ?? noRows, { scope: config.scope });
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
  const Slot = dynamic(() => {
    const render = asComponent<{ readonly header: HeaderApi }>(component()) ?? LabelHeader;
    const attached = partsOf(render);
    return () => createComponent(render, { header: headerApi(own, attached) });
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
  const values: Accessor<readonly unknown[]> = createMemo(() => {
    const getValue = own.column.column.getValue;
    return own.rows.filter((row) => row.kind === "data").map((row) => getValue?.(row.original));
  });
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
