import { expectTypeOf, it } from "vitest";
import { defineTable, type RequestOf, type SortableColumnIdOf, type StateOf, type Table, type TableOf } from "../define-table.js";
import { hasFeature, type FeatureHost } from "../feature.js";
import { createTableStore } from "../store.js";
import {
  remoteSorting,
  sorting,
  type RemoteSortingFeature,
  type RemoteSortingOptions,
  type SortDir,
  type SortingApi,
  type SortingFeature,
  type SortingOptions,
  type SortingState,
} from "./sorting.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number;
}

const usersTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: (col) => [col.key("name", { sortable: true }), col.key("email"), col.key("age", { sortable: true })],
  features: [sorting({ nulls: "first" })],
  initialState: { sorting: [{ id: "age", desc: true }] },
});

const remoteTable = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: usersTable.columns,
  features: [remoteSorting()],
});

it("takes optional options", () => {
  expectTypeOf(sorting).parameters.toEqualTypeOf<[options?: SortingOptions | undefined]>();
  expectTypeOf(remoteSorting).parameters.toEqualTypeOf<[options?: RemoteSortingOptions | undefined]>();
  // @ts-expect-error: remote sorting compares nothing in the browser
  remoteSorting({ nulls: "first" });
});

it("narrows initialState.sorting to the sortable columns", () => {
  expectTypeOf<SortableColumnIdOf<typeof usersTable>>().toEqualTypeOf<"name" | "age">();
  expectTypeOf<StateOf<typeof usersTable>["sorting"]>().toEqualTypeOf<readonly { readonly id: "name" | "age"; readonly desc: boolean }[]>();
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns: usersTable.columns,
    features: [sorting()],
    // @ts-expect-error: email isn't sortable
    initialState: { sorting: [{ id: "email", desc: false }] },
  });
});

it("puts sorting in the request only for remoteSorting", () => {
  // A table with only client sorting sends nothing, so its request is the empty object on purpose.
  // oxlint-disable-next-line typescript/no-generated-empty-object-type
  expectTypeOf<keyof RequestOf<typeof usersTable>>().toBeNever();
  expectTypeOf<RequestOf<typeof remoteTable>>().toEqualTypeOf<{
    readonly sorting: readonly { readonly id: "name" | "age"; readonly desc: boolean }[];
  }>();
});

it("has the same API either way", () => {
  const table = createTableStore(usersTable);
  const remote = createTableStore(remoteTable);
  expectTypeOf(table.sorting).toEqualTypeOf<SortingApi>();
  expectTypeOf(remote.sorting).toEqualTypeOf<SortingApi>();
  expectTypeOf(table.getFeatureState("sorting")).toEqualTypeOf(remote.getFeatureState("sorting"));
  expectTypeOf<SortingFeature["name"]>().toEqualTypeOf<"sorting">();
  expectTypeOf<RemoteSortingFeature["name"]>().toEqualTypeOf<"sorting">();
});

it("narrows with hasFeature", () => {
  const host: FeatureHost = createTableStore(usersTable);
  const remote: FeatureHost = createTableStore(remoteTable);
  if (!hasFeature(host, sorting) || !hasFeature(remote, remoteSorting)) throw new Error("sorting is installed");
  expectTypeOf(host.sorting).toEqualTypeOf<SortingApi>();
  expectTypeOf(remote.sorting).toEqualTypeOf<SortingApi>();
});

it("fits a generic table of either sorting feature", () => {
  expectTypeOf<TableOf<typeof usersTable>>().toExtend<Table<User, readonly [SortingFeature]>>();
  expectTypeOf<TableOf<typeof remoteTable>>().toExtend<Table<User, readonly [SortingFeature]>>();
  expectTypeOf<TableOf<typeof usersTable>>().toExtend<Table<User, readonly [RemoteSortingFeature]>>();
});

it("types the selectors", () => {
  expectTypeOf<SortingState>().toEqualTypeOf<readonly { readonly id: string & { readonly "~columnId"?: "sortable" }; readonly desc: boolean }[]>();
  expectTypeOf<SortDir>().toEqualTypeOf<"asc" | "desc" | false>();
});
