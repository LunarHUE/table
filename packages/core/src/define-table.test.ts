import { describe, expect, it } from "vitest";
import { defineColumn, defineColumns, type AnyColumn } from "./column.js";
import { defineTable } from "./define-table.js";
import { defineFeature, part, type AnyFeature, type AnyFeatureFactory } from "./feature.js";
import { clientReference } from "./fixtures/client-reference.js";
import { problem } from "./problem.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

const getRowId = (row: User) => row.id;
const sorting = defineFeature({ name: "sorting", state: { initial: [] as readonly { id: string; desc: boolean }[] } });
const selection = defineFeature({ name: "selection", state: { initial: [] as readonly string[] } });
const columnSort = defineFeature({ name: "columnSort", requires: () => [sorting] });
const selectColumn = defineColumn("select", { parts: [part(selection, {})] });
// Features that require each other can't infer each other's types, so these go through a helper.
const needing = (name: string, need: () => AnyFeatureFactory) => defineFeature({ name, requires: () => [need()] });

describe("defineTable", () => {
  it("returns a frozen definition from a column callback", () => {
    const def = defineTable<User>()({
      getRowId,
      columns: (col) => [selectColumn, col.key("name", { sortable: true }), col.key("email")],
      features: [sorting(), selection()],
      initialState: { sorting: [{ id: "name", desc: false }] },
    });
    expect(def.columns.map((column) => column.id)).toEqual(["select", "name", "email"]);
    expect(def.columnsById.get("name")).toBe(def.columns[1]);
    expect(def.features.map((feature) => feature.name)).toEqual(["sorting", "selection"]);
    expect([...def.resolvedFeatures.featureNames]).toEqual(["sorting", "selection"]);
    expect(def.initialState).toEqual({ sorting: [{ id: "name", desc: false }] });
    expect(def.getRowId).toBe(getRowId);
    for (const value of [def, def.columns, def.features, def.initialState]) expect(Object.isFrozen(value)).toBe(true);
  });

  it("treats a prebuilt column list the same as a callback", () => {
    const userColumns = defineColumns<User>()((col) => [col.key("name"), col.key("email")]);
    const prebuilt = [selectColumn, ...userColumns] as const;
    const fromList = defineTable<User>()({ getRowId, columns: prebuilt, features: [selection()] });
    const fromCallback = defineTable<User>()({
      getRowId,
      columns: (col) => [selectColumn, col.key("name"), col.key("email")],
      features: [selection()],
    });
    expect(fromList.columns.map((column) => column.id)).toEqual(fromCallback.columns.map((column) => column.id));
    expect(fromList.columns).toEqual(prebuilt);
    expect(fromList.columns).not.toBe(prebuilt);
    expect(fromList.columns[0]).toBe(selectColumn);
  });

  it("defaults to no features and no initial state", () => {
    const def = defineTable<User>()({ getRowId, columns: (col) => [col.key("name")] });
    expect(def.features).toEqual([]);
    expect(def.initialState).toEqual({});
  });

  it("rejects two columns with an id", () => {
    const columns: readonly AnyColumn<User>[] = [defineColumn("name"), defineColumn("name")];
    expect(() => defineTable<User>()({ getRowId, columns })).toThrow(problem("column:duplicate", "name"));
  });

  it("rejects a column part whose feature the table lacks", () => {
    const columns: readonly AnyColumn<User>[] = [selectColumn];
    expect(() => defineTable<User>()({ getRowId, columns })).toThrow(problem("feature:missing", "selection"));
  });

  it("rejects a feature whose requirement the table lacks, and a cycle", () => {
    const features: readonly AnyFeature[] = [columnSort()];
    expect(() => defineTable<User>()({ getRowId, columns: [], features })).toThrow(
      problem("feature:missing", "sorting columnSort"),
    );
    const ping = needing("ping", () => pong);
    const pong = needing("pong", () => ping);
    const cycle: readonly AnyFeature[] = [ping(), pong()];
    expect(() => defineTable<User>()({ getRowId, columns: [], features: cycle })).toThrow(problem("feature:cycle", "ping"));
  });

  it("rejects an initialState key that names no feature", () => {
    const initialState: Readonly<Record<string, unknown>> = { sortng: [] };
    const features: readonly AnyFeature[] = [sorting()];
    expect(() => defineTable<User>()({ getRowId, columns: [], features, initialState })).toThrow(
      problem("feature:unknown", "sortng"),
    );
  });

  it("never reads a cell, header or footer component", () => {
    const cell = clientReference();
    const header = clientReference();
    const footer = clientReference();
    const slots = { cell: cell.reference, header: header.reference, footer: footer.reference };
    const def = defineTable<User>()({
      getRowId,
      columns: (col) => [
        defineColumn("select", { ...slots, parts: [part(selection, {})] }),
        col.key("name", slots),
        col.accessor("upper", (row) => row.name.toUpperCase(), slots),
        col.custom("actions", slots),
      ],
      features: [selection()],
    });
    expect(def.columns.every((column) => column.cell === cell.reference)).toBe(true);
    expect([...cell.reads, ...header.reads, ...footer.reads]).toEqual([]);
  });
});
