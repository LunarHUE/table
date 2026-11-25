import { expectTypeOf, it } from "vitest";
import { defineColumn } from "../column.js";
import { defineTable, type RequestOf, type StateOf } from "../define-table.js";
import { hasFeature, type FeatureHost, type FeaturePart } from "../feature.js";
import { filtering, sorting, type User } from "../fixtures/table.js";
import { createTableStore } from "../store.js";
import {
  computeSelectAllState,
  computeSelectionSummary,
  isSelected,
  selectable,
  selection,
  type SelectableConfig,
  type SelectAllState,
  type SelectionApi,
  type SelectionCellApi,
  type SelectionState,
  type SelectionSummary,
  type SelectionTarget,
} from "./selection.js";

const columns = defineTable<User>()({ getRowId: (row) => row.id, columns: (col) => [col.key("name")] }).columns;
const selectColumn = defineColumn("select", { parts: [selectable()] });

const table = defineTable<User>()({
  getRowId: (row) => row.id,
  columns: [selectColumn, ...columns],
  features: [sorting(), filtering(), selection({ mode: "multi", resetOnRowsChange: "always" })],
});

it("takes optional options", () => {
  expectTypeOf(selection.featureName).toEqualTypeOf<"selection">();
  selection();
  selection({ mode: "single" });
  // @ts-expect-error: no such mode
  selection({ mode: "range" });
  // @ts-expect-error: no such policy
  selection({ resetOnRowsChange: "sometimes" });
});

it("brands the selectable part", () => {
  expectTypeOf(selectable()).toEqualTypeOf<FeaturePart<"selection", SelectableConfig, SelectionCellApi>>();
  selectable({ scope: "matching" });
  // @ts-expect-error: no such scope
  selectable({ scope: "everything" });
});

it("needs selection on a table with a selectable column", () => {
  const ok = defineTable<User>()({ getRowId: (row) => row.id, columns: [selectColumn], features: [selection()] });
  expectTypeOf(ok.columns[0].id).toEqualTypeOf<"select">();
  // @ts-expect-error: the select column needs the selection feature
  defineTable<User>()({ getRowId: (row) => row.id, columns: [selectColumn], features: [sorting()] });
});

it("types the state and leaves selection out of the request", () => {
  expectTypeOf<StateOf<typeof table>["selection"]>().toEqualTypeOf<SelectionState>();
  expectTypeOf<RequestOf<typeof table>>().toEqualTypeOf<{
    readonly sorting: { sort: string[] };
    readonly filtering: { query: string };
  }>();
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [selection()],
    initialState: { selection: { mode: "all", except: ["a"] } },
  });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [selection()],
    // @ts-expect-error: "all" mode has except, not ids
    initialState: { selection: { mode: "all", ids: ["a"] } },
  });
});

const fromHost = (host: FeatureHost) => (hasFeature(host, selection) ? host.selection : undefined);

it("gives the API and narrows with hasFeature", () => {
  expectTypeOf(createTableStore(table).selection).toEqualTypeOf<SelectionApi>();
  expectTypeOf(fromHost).returns.toEqualTypeOf<SelectionApi | undefined>();
});

it("types the helpers", () => {
  const state: SelectionState = { mode: "ids", ids: [] };
  expectTypeOf(isSelected("a")).toEqualTypeOf<(state: SelectionState) => boolean>();
  expectTypeOf(computeSelectAllState(state, [])).toEqualTypeOf<SelectAllState>();
  expectTypeOf(computeSelectionSummary(state, [], 3)).toEqualTypeOf<SelectionSummary>();
  expectTypeOf<SelectionSummary["target"]>().toEqualTypeOf<SelectionTarget>();
  expectTypeOf<SelectionSummary["count"]>().toEqualTypeOf<number | undefined>();
});
