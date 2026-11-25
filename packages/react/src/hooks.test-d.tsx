import type { ReactNode } from "react";
import { describe, expectTypeOf, it } from "vitest";
import {
  defineCell,
  hasFeature,
  pagination,
  selectable,
  sorting,
  useFeatureState,
  useIsFiltered,
  usePagination,
  useSelectAll,
  useSelection,
  useTable,
  useTableRequest,
  useTableRows,
  type CellApi,
  type ColumnView,
  type HeaderApi,
  type HeaderCell,
  type PaginationControls,
  type Row,
  type SelectAllControls,
  type SelectionCellApi,
  type SelectionHeaderApi,
  type SelectionSummary,
  type SortDir,
  type Table,
  type TableRowsView,
  type TableStore,
} from "./index.js";
import { userTable, type User } from "./test/fixtures.js";

type Pagination = ReturnType<typeof pagination>;

function DataTable<TRow>({ table, data }: { readonly table: Table<TRow, readonly [Pagination]>; readonly data: readonly TRow[] }) {
  const view = useTableRows(table, data);
  expectTypeOf(view).toEqualTypeOf<TableRowsView<TRow>>();
  expectTypeOf(usePagination(table, view)).toEqualTypeOf<PaginationControls>();
  expectTypeOf(usePagination(table, view).next).toEqualTypeOf<() => void>();
  expectTypeOf(useIsFiltered(table)).toEqualTypeOf<boolean>();
  if (hasFeature(table, sorting)) expectTypeOf(table.sorting.toggle).toBeFunction();
  // @ts-expect-error -- the generic table isn't known to have selection.
  useSelectAll(table, view.rows);
  return null;
}

const SelectCell = ({ cell }: { readonly cell: CellApi<unknown, User, SelectionCellApi> }): ReactNode => String(cell.selected);

describe("useTable", () => {
  it("returns the store for the definition", () => {
    const table = useTable(userTable);
    expectTypeOf(table).toEqualTypeOf<TableStore<typeof userTable>>();
    expectTypeOf(table).toExtend<Table<User, readonly [Pagination]>>();
  });

  it("types the bindings by the table's state", () => {
    expectTypeOf(useTable(userTable, { omitColumns: ["joined"], meta: { locale: "fr" } })).toEqualTypeOf<TableStore<typeof userTable>>();
    // @ts-expect-error -- "nope" is no column of the table.
    useTable(userTable, { bind: { sorting: { kind: "controlled", state: [{ id: "nope", desc: false }], onStateChange: () => {} } } });
  });
});

describe("a generic table component", () => {
  it("takes any table with pagination", () => {
    const table = useTable(userTable);
    expectTypeOf(DataTable<User>).parameter(0).toHaveProperty("table");
    void (<DataTable table={table} data={[]} />);
  });
});

describe("the data-aware hooks", () => {
  it("types their results", () => {
    const table = useTable(userTable);
    const view = useTableRows(table, []);
    expectTypeOf(view.rows).toEqualTypeOf<readonly Row<User>[]>();
    expectTypeOf(useSelectAll(table, view.rows, { scope: "matching" })).toEqualTypeOf<SelectAllControls>();
    expectTypeOf(useSelectAll(table, view.rows).toggle).toEqualTypeOf<() => void>();
    expectTypeOf(useSelection(table, view)).toEqualTypeOf<SelectionSummary>();
    // @ts-expect-error -- rows of another type.
    useTableRows(table, [{ other: true }]);
  });

  it("types feature state and the request by the definition", () => {
    const table = useTable(userTable);
    expectTypeOf(useFeatureState(table, "filtering")).toEqualTypeOf<{ readonly q: string }>();
    expectTypeOf(useFeatureState(table, sorting)).toEqualTypeOf<readonly { readonly id: "name" | "joined"; readonly desc: boolean }[]>();
    expectTypeOf(useFeatureState(table, "missing")).toEqualTypeOf<unknown>();
    expectTypeOf(useTableRequest(table)).toEqualTypeOf<{}>();
  });
});

describe("cell APIs", () => {
  it("adds the part API to the base", () => {
    expectTypeOf<CellApi<Date, User>["value"]>().toEqualTypeOf<Date>();
    expectTypeOf<CellApi<Date, User>["row"]>().toEqualTypeOf<Row<User>>();
    expectTypeOf<CellApi<Date, User>["column"]>().toEqualTypeOf<ColumnView<User>>();
    expectTypeOf<CellApi<unknown, User, SelectionCellApi>["selected"]>().toEqualTypeOf<boolean>();
    expectTypeOf<CellApi<unknown, User, SelectionCellApi>["toggleSelected"]>().toEqualTypeOf<() => void>();
    expectTypeOf<HeaderApi<User, SelectionHeaderApi>["header"]>().toEqualTypeOf<HeaderCell<User>>();
    expectTypeOf<HeaderApi<User, SelectionHeaderApi>["toggle"]>().toEqualTypeOf<() => void>();
    expectTypeOf<HeaderApi<User>>().not.toHaveProperty("toggle");
  });

  it("returns the component from defineCell", () => {
    expectTypeOf(defineCell(SelectCell, selectable())).toEqualTypeOf(SelectCell);
    // @ts-expect-error -- a part, not a config object.
    defineCell(SelectCell, { scope: "page" });
    expectTypeOf<SortDir>().toEqualTypeOf<"asc" | "desc" | false>();
  });
});
