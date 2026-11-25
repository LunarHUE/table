import { expectTypeOf, it } from "vitest";
import type { ColumnPipelineResult } from "./column-pipeline.js";
import type { Table, TableOf } from "./define-table.js";
import { filtering, makeDef, pagination, selection, sorting, type PageState, type User } from "./fixtures/table.js";
import type { DataRow, DetailRow, Row, TableRowsView } from "./row-pipeline.js";
import { createTableStore, type TableStore } from "./store.js";

const def = makeDef();
const store = createTableStore(def);
type Sorting = ReturnType<typeof sorting>;
type Pagination = ReturnType<typeof pagination>;

it("is the table its definition makes, and fits a generic table of fewer features", () => {
  expectTypeOf(store).toEqualTypeOf<TableStore<typeof def>>();
  expectTypeOf(store).toExtend<TableOf<typeof def>>();
  expectTypeOf(store).toExtend<Table<User, readonly [Sorting]>>();
  expectTypeOf(store).toExtend<Table<User, readonly [Sorting, Pagination]>>();
  expectTypeOf(store).not.toExtend<Table<{ readonly other: true }, readonly [Sorting]>>();
  expectTypeOf(store.sorting.sortBy).toEqualTypeOf<(id: string, desc?: boolean) => void>();
});

it("types feature state by name, with column ids narrowed", () => {
  expectTypeOf(store.getFeatureState("sorting")).toEqualTypeOf<readonly { readonly id: "name" | "age"; readonly desc: boolean }[]>();
  expectTypeOf(store.getFeatureState("pagination")).toEqualTypeOf<PageState>();
  expectTypeOf(store.getServerFeatureState("filtering")).toEqualTypeOf<{ query: string }>();
  expectTypeOf(store.getState().selection).toEqualTypeOf<Readonly<Record<string, boolean>>>();
  // @ts-expect-error: no feature is named "nope"
  store.getFeatureState("nope");
});

it("types the request from the features with a request seam", () => {
  expectTypeOf(store.getRequest()).toEqualTypeOf<{
    readonly sorting: { sort: string[] };
    readonly filtering: { query: string };
  }>();
  expectTypeOf(store.getRequestKey()).toBeString();
});

it("types rows and columns by the table's row type", () => {
  const view = store.computeRows([]);
  expectTypeOf(view).toEqualTypeOf<TableRowsView<User>>();
  expectTypeOf(store.getColumns()).toEqualTypeOf<ColumnPipelineResult<User>>();
  // @ts-expect-error: the data must be the table's rows
  store.computeRows([{ id: "a" }]);
  const row = view.rows[0];
  if (row?.kind === "detail") {
    expectTypeOf(row).toEqualTypeOf<DetailRow<User>>();
    expectTypeOf(row.parentId).toBeString();
    expectTypeOf(row.canExpand).toEqualTypeOf<false>();
  } else if (row) {
    expectTypeOf(row).toEqualTypeOf<DataRow<User>>();
    expectTypeOf(row.parentId).toEqualTypeOf<string | null>();
  }
  expectTypeOf<Row<User>["original"]>().toEqualTypeOf<User>();
});

it("types bindings by slice", () => {
  createTableStore(def, {
    bind: { filtering: { kind: "controlled", state: { query: "" }, onStateChange: () => {} } },
    omitColumns: ["email"],
  });
  createTableStore(def, {
    // @ts-expect-error: the binding's value must be the slice's
    bind: { filtering: { kind: "controlled", state: { q: 1 }, onStateChange: () => {} } },
  });
  store.updateOptions({ meta: { page: "users" } });
  expectTypeOf(selection.featureName).toEqualTypeOf<"selection">();
  expectTypeOf(filtering.featureName).toEqualTypeOf<"filtering">();
});
