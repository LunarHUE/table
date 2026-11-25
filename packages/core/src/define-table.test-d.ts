import { expectTypeOf, it } from "vitest";
import { defineColumn, defineColumns, type AnyColumn } from "./column.js";
import type { JsonObject, SortableColumnId } from "./contract.js";
import {
  defineTable,
  type ColumnIdOf,
  type ColumnsOf,
  type FeaturesOf,
  type NeedsInitialState,
  type RequestOf,
  type RowOf,
  type SortableColumnIdOf,
  type StateOf,
  type Table,
  type TableOf,
} from "./define-table.js";
import { defineFeature, part, type Feature, type HasRequest } from "./feature.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
  readonly address: { readonly city: string };
}

interface SortEntry {
  readonly id: SortableColumnId;
  readonly desc: boolean;
}

const sorting = defineFeature({
  name: "sorting",
  state: { initial: [] as readonly SortEntry[] },
  api: (ctx) => ({ sortBy: (id: string) => ctx.setState([{ id, desc: false }]) }),
  request: (state) => ({ sort: state }),
});

const pagination = defineFeature({
  name: "pagination",
  state: { initial: { pageIndex: 0, pageSize: 20 } },
  api: (ctx) => ({ setPage: (pageIndex: number) => ctx.setState((prev) => ({ ...prev, pageIndex })) }),
  request: (state) => ({ offset: state.pageIndex * state.pageSize, limit: state.pageSize }),
});

const noneSelected: readonly string[] = [];
const selection = defineFeature({
  name: "selection",
  state: { initial: noneSelected, keyed: "row" },
  api: (ctx) => ({ clear: () => ctx.setState([]) }),
});
const selectable = () => part(selection, { mode: "multi" });

const columnSort = defineFeature({
  name: "columnSort",
  requires: () => [sorting],
  api: (ctx) => ({ first: () => ctx.getFeatureState("sorting")[0] }),
});

/** A feature with no usable default: the table must set its filters. */
function filtering<TFilters extends JsonObject>(): NeedsInitialState<
  Feature<"filtering", void, TFilters, { readonly set: (filters: TFilters) => void }, TFilters, HasRequest<TFilters>, readonly []>
> {
  const empty: JsonObject = {};
  return defineFeature({
    name: "filtering",
    // The table's `initialState` replaces this placeholder.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    state: { initial: empty as TFilters, rowsEffect: "matching" },
    api: (ctx) => ({ set: (filters: TFilters) => ctx.setState(filters) }),
    request: (state) => state,
  })();
}
filtering.featureName = "filtering" as const;

type UserFilters = { readonly search: string; readonly role?: "admin" | "member" };

const selectColumn = defineColumn("select", { parts: [selectable()], cell: "SelectCell" });

const usersTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: (col) => [
    selectColumn,
    col.key("name", { sortable: true }),
    col.key("email"),
    col.key("age", { sortable: true }),
    col.accessor("city", (row) => row.address.city),
    col.custom("actions"),
  ],
  features: [sorting(), pagination(), selection()],
  initialState: { sorting: [{ id: "name", desc: false }] },
});
type UsersDef = typeof usersTable;

it("infers literal column ids and the sortable ones", () => {
  expectTypeOf<ColumnIdOf<UsersDef>>().toEqualTypeOf<"select" | "name" | "email" | "age" | "city" | "actions">();
  expectTypeOf<SortableColumnIdOf<UsersDef>>().toEqualTypeOf<"name" | "age">();
  expectTypeOf<RowOf<UsersDef>>().toEqualTypeOf<User>();
  expectTypeOf<FeaturesOf<UsersDef>[number]["name"]>().toEqualTypeOf<"sorting" | "pagination" | "selection">();
});

it("infers each column's value", () => {
  type Columns = ColumnsOf<UsersDef>;
  expectTypeOf<Columns[1]["~value"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Columns[3]["~value"]>().toEqualTypeOf<number | undefined>();
  expectTypeOf<Columns[4]["~value"]>().toEqualTypeOf<string | undefined>();
  expectTypeOf<Columns[5]["~value"]>().toEqualTypeOf<undefined>();
});

it("takes a prebuilt column list the same as a callback", () => {
  const userColumns = defineColumns<User>()((col) => [col.key("name", { sortable: true }), col.key("email")]);
  const def = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: [selectColumn, ...userColumns],
    features: [sorting(), selection()],
    initialState: { sorting: [{ id: "name", desc: true }] },
  });
  expectTypeOf<ColumnIdOf<typeof def>>().toEqualTypeOf<"select" | "name" | "email">();
  expectTypeOf<SortableColumnIdOf<typeof def>>().toEqualTypeOf<"name">();
});

it("narrows column ids in initialState and the state type", () => {
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name", { sortable: true }), col.key("email")],
    features: [sorting()],
    // @ts-expect-error `email` isn't sortable.
    initialState: { sorting: [{ id: "email", desc: false }] },
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name", { sortable: true })],
    features: [sorting()],
    // @ts-expect-error No column is named `nope`.
    initialState: { sorting: [{ id: "nope", desc: false }] },
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name", { sortable: true })],
    features: [sorting()],
    // @ts-expect-error No feature is named `sortng`.
    initialState: { sortng: [] },
  });
  expectTypeOf<StateOf<UsersDef>["sorting"][number]["id"]>().toEqualTypeOf<"name" | "age">();
  expectTypeOf<RequestOf<UsersDef>>().toEqualTypeOf<{
    readonly sorting: { sort: readonly { readonly id: "name" | "age"; readonly desc: boolean }[] };
    readonly pagination: { offset: number; limit: number };
  }>();
});

it("keeps column ids from initialState out of inference", () => {
  const def = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name", { sortable: true })],
    features: [sorting()],
    initialState: { sorting: [] },
  });
  expectTypeOf<ColumnIdOf<typeof def>>().toEqualTypeOf<"name">();
});

it("requires initialState for a feature marked NeedsInitialState", () => {
  // @ts-expect-error `filtering` has no default, so `initialState.filtering` is required.
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name")],
    features: [filtering<UserFilters>()],
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name")],
    features: [filtering<UserFilters>()],
    // @ts-expect-error `search` is required.
    initialState: { filtering: { role: "admin" } },
  });
  const def = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name")],
    features: [filtering<UserFilters>()],
    initialState: { filtering: { search: "" } },
  });
  expectTypeOf<StateOf<typeof def>["filtering"]>().toEqualTypeOf<UserFilters>();
});

it("rejects a column part whose feature the table lacks", () => {
  defineTable<User>()({
    getRowId: (row) => row.id,
    // @ts-expect-error `selectColumn` needs `selection`.
    columns: [selectColumn],
    features: [sorting()],
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    // @ts-expect-error `selectColumn` needs `selection`, and the table has no features.
    columns: (col) => [selectColumn, col.key("name")],
  });
  const withSelection = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: [selectColumn],
    features: [selection()],
  });
  expectTypeOf<ColumnIdOf<typeof withSelection>>().toEqualTypeOf<"select">();
});

it("rejects a feature whose requirement the table lacks", () => {
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name")],
    // @ts-expect-error `columnSort` requires `sorting`.
    features: [columnSort()],
  });
  const complete = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name")],
    features: [columnSort(), sorting()],
  });
  expectTypeOf<FeaturesOf<typeof complete>[number]["name"]>().toEqualTypeOf<"columnSort" | "sorting">();
});

it("rejects columns of other rows and keys the rows lack", () => {
  interface Order {
    readonly total: number;
  }
  const orderColumns = defineColumns<Order>()((col) => [col.key("total")]);
  defineTable<User>()({
    getRowId: (row) => row.id,
    // @ts-expect-error Order columns don't read users.
    columns: orderColumns,
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    // @ts-expect-error Users have no `total`.
    columns: (col) => [col.key("total")],
  });
  expectTypeOf(orderColumns).not.toExtend<readonly AnyColumn<User>[]>();
});

it("takes columns built at runtime", () => {
  const dynamic: readonly AnyColumn<User>[] = ["name", "email"].map((id) => defineColumn(id, { sortable: true }));
  const def = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: dynamic,
    features: [sorting(), selection()],
    initialState: { sorting: [{ id: "anything", desc: false }] },
  });
  expectTypeOf<ColumnIdOf<typeof def>>().toEqualTypeOf<string>();
  expectTypeOf<SortableColumnIdOf<typeof def>>().toEqualTypeOf<string>();
});

it("fits a concrete table into a generic one with fewer features", () => {
  type UsersTable = TableOf<UsersDef>;
  expectTypeOf<UsersTable>().toExtend<Table<User>>();
  expectTypeOf<UsersTable>().toExtend<Table<User, readonly [ReturnType<typeof sorting>]>>();
  expectTypeOf<UsersTable>().toExtend<Table<User, readonly [ReturnType<typeof pagination>, ReturnType<typeof sorting>]>>();
  expectTypeOf<UsersTable>().not.toExtend<Table<User, readonly [ReturnType<typeof columnSort>]>>();
  expectTypeOf<UsersTable["sorting"]["sortBy"]>().toEqualTypeOf<(id: string) => void>();
  interface Order {
    readonly total: number;
  }
  expectTypeOf<UsersTable>().not.toExtend<Table<Order>>();
  const generic = (table: Table<User, readonly [ReturnType<typeof sorting>]>) => table.sorting.sortBy("name");
  expectTypeOf(generic).parameter(0).toExtend<Table<User>>();
});

it("stays within the type budget for a 25-column table with 5 features", () => {
  interface Wide {
    readonly c01: string;
    readonly c02: number;
    readonly c03: boolean;
    readonly c04: string;
    readonly c05: number;
    readonly c06: string;
    readonly c07: number;
    readonly c08: boolean;
    readonly c09: string;
    readonly c10: number;
    readonly c11: string;
    readonly c12: number;
    readonly c13: boolean;
    readonly c14: string;
    readonly c15: number;
    readonly c16: string;
    readonly c17: number;
    readonly c18: boolean;
    readonly c19: string;
    readonly c20: { readonly nested: string };
  }
  const wideTable = defineTable<Wide>()({
    getRowId: (row) => row.c01,
    columns: (col) => [
      selectColumn,
      col.key("c01", { sortable: true }),
      col.key("c02", { sortable: true }),
      col.key("c03"),
      col.key("c04", { sortable: true, label: "Four" }),
      col.key("c05"),
      col.key("c06", { group: "g" }),
      col.key("c07", { sortable: true }),
      col.key("c08"),
      col.key("c09"),
      col.key("c10", { sortable: true }),
      col.key("c11"),
      col.key("c12"),
      col.key("c13", { meta: { align: "end" } }),
      col.key("c14"),
      col.key("c15", { sortable: true }),
      col.key("c16"),
      col.key("c17"),
      col.key("c18"),
      col.key("c19"),
      col.accessor("nested", (row) => row.c20.nested, { sortable: true }),
      col.accessor("sum", (row) => row.c02 + row.c05),
      col.accessor("flag", (row) => row.c03 && row.c08),
      col.custom("actions"),
      defineColumn("spacer"),
    ],
    features: [sorting(), pagination(), selection(), columnSort(), filtering<UserFilters>()],
    initialState: {
      sorting: [{ id: "c07", desc: true }],
      pagination: { pageIndex: 0, pageSize: 50 },
      filtering: { search: "" },
    },
  });
  type WideDef = typeof wideTable;
  expectTypeOf<ColumnsOf<WideDef>["length"]>().toEqualTypeOf<25>();
  expectTypeOf<SortableColumnIdOf<WideDef>>().toEqualTypeOf<"c01" | "c02" | "c04" | "c07" | "c10" | "c15" | "nested">();
  expectTypeOf<ColumnIdOf<WideDef>>().toExtend<string>();
  expectTypeOf<RequestOf<WideDef>["filtering"]>().toEqualTypeOf<UserFilters>();
  expectTypeOf<TableOf<WideDef>>().toExtend<Table<Wide, readonly [ReturnType<typeof pagination>]>>();
});
