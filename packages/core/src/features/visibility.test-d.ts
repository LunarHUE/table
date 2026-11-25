import { expectTypeOf, it } from "vitest";
import { defineTable, type RequestOf, type StateOf, type Table, type TableOf } from "../define-table.js";
import { hasFeature, type FeatureHost } from "../feature.js";
import { createTableStore } from "../store.js";
import {
  columnLayout,
  columnSizeVars,
  columnVisible,
  visibility,
  type ColumnLayoutApi,
  type ColumnLayoutFeature,
  type VisibilityApi,
  type VisibilityFeature,
} from "./visibility.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
}

const visibilityTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: (col) => [col.key("name"), col.key("email"), col.key("age")],
  features: [visibility()],
  initialState: { visibility: { hidden: ["email"] } },
});

const layoutTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: visibilityTable.columns,
  features: [columnLayout()],
  initialState: { columnLayout: { hidden: [], order: ["age"], pinned: { start: ["name"], end: [] }, sizes: { age: 80 } } },
});

type Id = "name" | "email" | "age";

it("takes no options", () => {
  expectTypeOf(visibility).parameters.toEqualTypeOf<[]>();
  expectTypeOf(columnLayout).parameters.toEqualTypeOf<[]>();
});

it("narrows column ids in initialState", () => {
  expectTypeOf<StateOf<typeof visibilityTable>["visibility"]>().toEqualTypeOf<{ readonly hidden: readonly Id[] }>();
  expectTypeOf<StateOf<typeof layoutTable>["columnLayout"]["pinned"]>().toEqualTypeOf<{
    readonly start: readonly Id[];
    readonly end: readonly Id[];
  }>();
  expectTypeOf<StateOf<typeof layoutTable>["columnLayout"]["order"]>().toEqualTypeOf<readonly Id[]>();
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: visibilityTable.columns,
    features: [visibility()],
    // @ts-expect-error: there is no "emial" column
    initialState: { visibility: { hidden: ["emial"] } },
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: visibilityTable.columns,
    features: [columnLayout()],
    // @ts-expect-error: there is no "agee" column
    initialState: { columnLayout: { hidden: [], order: ["agee"], pinned: { start: [], end: [] }, sizes: {} } },
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: visibilityTable.columns,
    features: [columnLayout()],
    // @ts-expect-error: there is no "nme" column
    initialState: { columnLayout: { hidden: [], order: [], pinned: { start: ["nme"], end: [] }, sizes: {} } },
  });
});

it("stays out of the request", () => {
  // Neither feature sends anything, so the request is the empty object on purpose.
  // oxlint-disable-next-line typescript/no-generated-empty-object-type
  expectTypeOf<keyof RequestOf<typeof visibilityTable>>().toBeNever();
  // oxlint-disable-next-line typescript/no-generated-empty-object-type
  expectTypeOf<keyof RequestOf<typeof layoutTable>>().toBeNever();
});

it("puts the API on the table", () => {
  expectTypeOf(createTableStore(visibilityTable).visibility).toEqualTypeOf<VisibilityApi>();
  expectTypeOf(createTableStore(layoutTable).columnLayout).toEqualTypeOf<ColumnLayoutApi>();
});

it("narrows with hasFeature", () => {
  const host: FeatureHost = createTableStore(visibilityTable);
  const other: FeatureHost = createTableStore(layoutTable);
  if (!hasFeature(host, visibility) || !hasFeature(other, columnLayout)) throw new Error("the features are installed");
  expectTypeOf(host.visibility).toEqualTypeOf<VisibilityApi>();
  expectTypeOf(other.columnLayout).toEqualTypeOf<ColumnLayoutApi>();
});

it("fits a generic table of the feature", () => {
  expectTypeOf<TableOf<typeof visibilityTable>>().toExtend<Table<User, readonly [VisibilityFeature]>>();
  expectTypeOf<TableOf<typeof layoutTable>>().toExtend<Table<User, readonly [ColumnLayoutFeature]>>();
});

it("types the helpers", () => {
  expectTypeOf(columnVisible("name")).returns.toEqualTypeOf<boolean>();
  expectTypeOf(columnSizeVars).returns.toEqualTypeOf<Readonly<Record<string, string>>>();
});
