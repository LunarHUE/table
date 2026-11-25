import { For, type Accessor, type Element as SolidElement } from "solid-js";
import { describe, expectTypeOf, it } from "vitest";
import {
  Cell,
  createFeatureState,
  createPagination,
  createSelectAll,
  createSelection,
  createTable,
  createTableRequest,
  createTableRows,
  createVisibleColumns,
  defineCell,
  defineTable,
  hasFeature,
  pagination,
  remotePagination,
  remoteSorting,
  selectable,
  selection,
  type CellApi,
  type HeaderApi,
  type PaginationControls,
  type Row,
  type SelectAllControls,
  type SelectionCellApi,
  type SelectionHeaderApi,
  type SelectionSummary,
  type RequestOf,
  type StateOf,
  type Table,
  type TableRowsView,
} from "./index.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly joined: Date;
}

const def = defineTable<User>()({
  getRowId: (user) => user.id,
  columns: (col) => [col.key("name", { sortable: true }), col.key("joined")],
  features: [remoteSorting(), remotePagination(), selection()],
});

describe("table primitives", () => {
  const table = createTable(def);

  it("types rows, the request and feature state from the definition", () => {
    expectTypeOf(createTableRows(table, () => [] as User[])).toEqualTypeOf<Accessor<TableRowsView<User>>>();
    expectTypeOf(createTableRequest(table)).toEqualTypeOf<Accessor<RequestOf<typeof def>>>();
    expectTypeOf(createTableRequest(table)().pagination.pageSize).toEqualTypeOf<number>();
    expectTypeOf(createFeatureState(table, "sorting")).toEqualTypeOf<Accessor<StateOf<typeof def>["sorting"]>>();
    expectTypeOf(createFeatureState(table, "sorting")()[0]?.id).toEqualTypeOf<"name" | undefined>();
    // @ts-expect-error The data must be the table's rows.
    createTableRows(table, () => [{ id: "x" }]);
    // Options may be an accessor.
    createTable(def, () => ({ omitColumns: ["joined"], meta: { locale: "en" } }));
  });

  it("types the relative primitives with 0-arg commands", () => {
    const view = createTableRows(table, () => []);
    const pager = createPagination(table, view);
    expectTypeOf(pager).toEqualTypeOf<PaginationControls>();
    expectTypeOf(pager.next).toEqualTypeOf<() => void>();
    expectTypeOf(pager.pageCount).toEqualTypeOf<number>();
    const all = createSelectAll(table, () => view().rows, { scope: "matching" });
    expectTypeOf(all).toEqualTypeOf<Accessor<SelectAllControls>>();
    expectTypeOf(all().toggle).toEqualTypeOf<() => void>();
    expectTypeOf(createSelection(table, view)).toEqualTypeOf<Accessor<SelectionSummary>>();
    const plain = createTable(defineTable<User>()({ getRowId: (user) => user.id, columns: (col) => [col.key("name")] }));
    // @ts-expect-error A pager needs pagination.
    createPagination(plain, view);
  });
});

const SelectCell = defineCell((props: { readonly cell: CellApi<unknown, unknown, SelectionCellApi> }): SolidElement => {
  expectTypeOf(props.cell.selected).toEqualTypeOf<boolean>();
  expectTypeOf(props.cell.toggleSelected).toEqualTypeOf<() => void>();
  return null;
}, selectable());

const DateCell = (props: { readonly cell: CellApi<Date, User> }) => {
  expectTypeOf(props.cell.value).toEqualTypeOf<Date>();
  expectTypeOf(props.cell.row).toEqualTypeOf<Row<User>>();
  return null;
};

const SelectHeader = (props: { readonly header: HeaderApi<unknown, SelectionHeaderApi> }) => {
  expectTypeOf(props.header.toggle).toEqualTypeOf<() => void>();
  expectTypeOf(props.header.indeterminate).toEqualTypeOf<boolean>();
  return null;
};

/** One table component for any rows, as an app writes it once. */
function DataTable<TRow>(props: { readonly table: Table<TRow>; readonly data: readonly TRow[] }) {
  const view = createTableRows(props.table, () => props.data);
  expectTypeOf(view).toEqualTypeOf<Accessor<TableRowsView<TRow>>>();
  const columns = createVisibleColumns(props.table);
  const table = props.table;
  if (hasFeature(table, pagination)) expectTypeOf(createPagination(table, view).canNext).toEqualTypeOf<boolean>();
  return (
    <For each={view().rows}>
      {(row) => <For each={columns()}>{(column) => <Cell table={props.table} row={row} column={column} />}</For>}
    </For>
  );
}

describe("slot components", () => {
  it("types the cell and header APIs", () => {
    expectTypeOf(SelectCell).toEqualTypeOf<(props: { readonly cell: CellApi<unknown, unknown, SelectionCellApi> }) => SolidElement>();
    expectTypeOf(DateCell).toBeFunction();
    expectTypeOf(SelectHeader).toBeFunction();
  });

  it("compiles a generic DataTable over any rows", () => {
    const table = createTable(def);
    expectTypeOf(<DataTable table={table} data={[] as User[]} />).not.toBeAny();
    // @ts-expect-error The data must be the table's rows.
    void (<DataTable table={table} data={[{ id: "x" }]} />);
  });
});
