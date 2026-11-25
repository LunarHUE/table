import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ColumnViewInfo } from "../contract.js";
import { defineTable } from "../define-table.js";
import { filtering, pagination, seen, stageRuns, users, type User } from "../fixtures/table.js";
import { createTableStore } from "../store.js";
import { remoteSorting } from "./sorting.js";
import {
  columnLayout,
  columnSizeVars,
  columnVisible,
  isColumnVisible,
  visibility,
  type VisibilityState,
} from "./visibility.js";

const columns = [
  { id: "name", sortable: true, getValue: (row: User) => row.name },
  { id: "email", getValue: (row: User) => row.email },
  { id: "age", sortable: true, getValue: (row: User) => row.age },
] as const;

type Id = (typeof columns)[number]["id"];

const makeVisibility = (initial?: { readonly hidden: readonly Id[] }, omitColumns?: readonly string[]) =>
  createTableStore(
    defineTable<User>()({
      getRowId: (row) => row.id,
      columns,
      features: [filtering(), pagination(), remoteSorting(), visibility()],
      ...(initial ? { initialState: { visibility: initial } } : {}),
    }),
    omitColumns ? { omitColumns } : {},
  );

interface Layout {
  readonly hidden: readonly Id[];
  readonly order: readonly Id[];
  readonly pinned: { readonly start: readonly Id[]; readonly end: readonly Id[] };
  readonly sizes: Readonly<Record<string, number>>;
}

const makeLayout = (initial?: Layout) =>
  createTableStore(
    defineTable<User>()({
      getRowId: (row) => row.id,
      columns,
      features: [filtering(), pagination(), remoteSorting(), columnLayout()],
      ...(initial ? { initialState: { columnLayout: initial } } : {}),
    }),
  );

// Saved states, as an app loading `localStorage` would read them: the guards trust the JSON's ids.
const savedVisibility = (saved: unknown): saved is { readonly hidden: readonly Id[] } => typeof saved === "object" && saved !== null;
const savedLayout = (saved: unknown): saved is Layout => typeof saved === "object" && saved !== null;

const view = (id: string, size?: number): ColumnViewInfo => ({
  id,
  visible: true,
  zone: "center",
  order: 0,
  ...(size === undefined ? {} : { size }),
});

type Store = ReturnType<typeof makeVisibility> | ReturnType<typeof makeLayout>;

const shown = (table: Store) => table.getColumns().visibleColumns.map((column) => column.id);
const all = (table: Store) => table.getColumns().allColumns.map((column) => column.id);

beforeEach(() => {
  stageRuns.filter = 0;
  stageRuns.sort = 0;
  stageRuns.window = 0;
  seen.sources = [];
});

describe("selectors", () => {
  it("read whether a column shows", () => {
    const state: VisibilityState = { hidden: ["email"] };
    expect(isColumnVisible(state, "email")).toBe(false);
    expect(isColumnVisible(state, "name")).toBe(true);
    expect(columnVisible("email")(state)).toBe(false);
  });

  it("make CSS variables for the columns with a size", () => {
    expect(columnSizeVars([view("name", 120), view("email"), view("age", 64.5)])).toEqual({
      "--col-name-size": "120px",
      "--col-age-size": "64.5px",
    });
  });
});

describe("visibility", () => {
  it("toggles, sets, replaces, shows all and resets", () => {
    const table = makeVisibility({ hidden: ["age"] });
    expect(shown(table)).toEqual(["name", "email"]);
    table.visibility.toggle("email");
    expect(table.getFeatureState("visibility").hidden).toEqual(["age", "email"]);
    expect(shown(table)).toEqual(["name"]);
    table.visibility.toggle("age");
    expect(shown(table)).toEqual(["name", "age"]);
    table.visibility.set("name", false);
    table.visibility.set("age", true);
    expect(table.getFeatureState("visibility").hidden).toEqual(["email", "name"]);
    table.visibility.setHidden(["age"]);
    expect(shown(table)).toEqual(["name", "email"]);
    table.visibility.showAll();
    expect(shown(table)).toEqual(["name", "email", "age"]);
    table.visibility.reset();
    expect(table.getFeatureState("visibility")).toEqual({ hidden: ["age"] });
  });

  it("keeps hidden columns in allColumns with order -1", () => {
    const table = makeVisibility({ hidden: ["email"] });
    expect(all(table)).toEqual(["name", "email", "age"]);
    expect(table.getColumns().allColumns.map((column) => column.order)).toEqual([0, -1, 1]);
  });

  it("keeps the state when a write changes nothing", () => {
    const table = makeVisibility({ hidden: ["age"] });
    const before = table.getFeatureState("visibility");
    table.visibility.set("age", false);
    table.visibility.set("name", true);
    expect(table.getFeatureState("visibility")).toBe(before);
    const columnsBefore = table.getColumns();
    table.visibility.set("age", false);
    expect(table.getColumns()).toBe(columnsBefore);
  });

  it("drops stale and duplicate ids from a saved state, and keeps a valid one", () => {
    const saved: unknown = JSON.parse('{"hidden":["email","gone","email"]}');
    if (!savedVisibility(saved)) throw new Error("not a saved state");
    const table = makeVisibility(saved);
    expect(table.getFeatureState("visibility")).toEqual({ hidden: ["email"] });
    expect(shown(table)).toEqual(["name", "age"]);

    const valid = { hidden: ["age"] } as const;
    expect(makeVisibility(valid).getFeatureState("visibility")).toBe(valid);
  });

  it("wakes only the column whose visibility changed", () => {
    const table = makeVisibility();
    const name = vi.fn<() => void>();
    const email = vi.fn<() => void>();
    table.subscribeColumn("visibility", "name", name);
    table.subscribeColumn("visibility", "email", email);
    table.visibility.toggle("email");
    expect([name.mock.calls.length, email.mock.calls.length]).toEqual([0, 1]);
    expect(table.getKeyedState("visibility", "email")).toBe(false);
    expect(table.getKeyedState("visibility", "name")).toBe(true);
  });

  it("never re-runs the row pipeline or resets the page", () => {
    const table = makeVisibility();
    table.pagination.setPage(1);
    const rows = table.computeRows(users);
    const runs = { ...stageRuns };
    seen.sources = [];
    table.visibility.toggle("email");
    table.visibility.setHidden(["name", "age"]);
    table.visibility.showAll();
    expect(table.computeRows(users)).toBe(rows);
    expect(stageRuns).toEqual(runs);
    expect(seen.sources).toEqual([]);
    expect(table.getFeatureState("pagination").pageIndex).toBe(1);
  });

  it("can't show a column the app omits", () => {
    const table = makeVisibility(undefined, ["email"]);
    table.visibility.set("email", true);
    table.visibility.showAll();
    expect(all(table)).toEqual(["name", "age"]);
  });

  it("stays out of the request", () => {
    const table = makeVisibility({ hidden: ["age"] });
    expect(Object.keys(table.getRequest())).toEqual(["filtering", "sorting"]);
  });
});

describe("columnLayout", () => {
  const empty: Layout = { hidden: [], order: [], pinned: { start: [], end: [] }, sizes: {} };

  it("shows and hides columns", () => {
    const table = makeLayout();
    table.columnLayout.setVisible("email", false);
    table.columnLayout.toggleVisible("age");
    expect(shown(table)).toEqual(["name"]);
    table.columnLayout.toggleVisible("age");
    expect(shown(table)).toEqual(["name", "age"]);
    table.columnLayout.showAll();
    expect(shown(table)).toEqual(["name", "email", "age"]);
  });

  it("orders columns, with unlisted ones after in definition order", () => {
    const table = makeLayout();
    table.columnLayout.setOrder(["age"]);
    expect(shown(table)).toEqual(["age", "name", "email"]);
    table.columnLayout.moveColumn("name", 2);
    expect(shown(table)).toEqual(["age", "email", "name"]);
    expect(table.getFeatureState("columnLayout").order).toEqual(["age", "email", "name"]);
    table.columnLayout.moveColumn("name", -5);
    expect(shown(table)).toEqual(["name", "age", "email"]);
    table.columnLayout.moveColumn("email", 99);
    expect(shown(table)).toEqual(["name", "age", "email"]);
    const before = table.getFeatureState("columnLayout");
    table.columnLayout.moveColumn("email", 2);
    table.columnLayout.moveColumn("nope", 0);
    expect(table.getFeatureState("columnLayout")).toBe(before);
  });

  it("pins columns to the start or end and unpins them", () => {
    const table = makeLayout();
    table.columnLayout.pin("age", "start");
    table.columnLayout.pin("name", "end");
    let zones = table.getColumns().zones;
    expect(zones.start.map((column) => column.id)).toEqual(["age"]);
    expect(zones.center.map((column) => column.id)).toEqual(["email"]);
    expect(zones.end.map((column) => column.id)).toEqual(["name"]);
    expect(shown(table)).toEqual(["age", "email", "name"]);

    table.columnLayout.pin("name", "start");
    expect(table.getFeatureState("columnLayout").pinned).toEqual({ start: ["age", "name"], end: [] });
    zones = table.getColumns().zones;
    expect(zones.start.map((column) => column.id)).toEqual(["age", "name"]);

    table.columnLayout.pin("age", "center");
    table.columnLayout.pin("name", "center");
    expect(table.getFeatureState("columnLayout").pinned).toEqual({ start: [], end: [] });
    expect(shown(table)).toEqual(["name", "email", "age"]);
  });

  it("sizes columns and turns sizes into CSS variables", () => {
    const table = makeLayout();
    table.columnLayout.setSize("name", 180);
    table.columnLayout.setSize("age", 0);
    table.columnLayout.setSize("email", Number.NaN);
    expect(table.getFeatureState("columnLayout").sizes).toEqual({ name: 180 });
    expect(table.getColumns().visibleColumns[0]?.size).toBe(180);
    expect(columnSizeVars(table.getColumns().visibleColumns)).toEqual({ "--col-name-size": "180px" });
    table.columnLayout.setSize("name", undefined);
    expect(table.getFeatureState("columnLayout").sizes).toEqual({});
    expect(columnSizeVars(table.getColumns().visibleColumns)).toEqual({});
  });

  it("resets to the starting layout", () => {
    const start: Layout = { ...empty, hidden: ["email"], sizes: { age: 50 } };
    const table = makeLayout(start);
    table.columnLayout.showAll();
    table.columnLayout.setSize("age", 90);
    table.columnLayout.pin("name", "end");
    table.columnLayout.reset();
    expect(table.getFeatureState("columnLayout")).toBe(start);
  });

  it("drops stale, duplicate and bad entries from a saved layout, and keeps a valid one", () => {
    const saved: unknown = JSON.parse(
      JSON.stringify({
        hidden: ["gone", "email", "email"],
        order: ["age", "gone", "age", "name"],
        pinned: { start: ["name", "gone"], end: ["name", "age", "age"] },
        sizes: { name: 100, gone: 50, email: -4, age: "wide" },
      }),
    );
    if (!savedLayout(saved)) throw new Error("not a saved state");
    const table = makeLayout(saved);
    expect(table.getFeatureState("columnLayout")).toEqual({
      hidden: ["email"],
      order: ["age", "name"],
      pinned: { start: ["name"], end: ["age"] },
      sizes: { name: 100 },
    });

    const valid: Layout = { hidden: ["age"], order: ["email"], pinned: { start: ["name"], end: [] }, sizes: { email: 70 } };
    expect(makeLayout(valid).getFeatureState("columnLayout")).toBe(valid);
  });

  it("wakes only the column whose layout changed", () => {
    const table = makeLayout();
    const name = vi.fn<() => void>();
    const email = vi.fn<() => void>();
    table.subscribeColumn("columnLayout", "name", name);
    table.subscribeColumn("columnLayout", "email", email);
    table.columnLayout.setSize("email", 200);
    table.columnLayout.pin("email", "end");
    table.columnLayout.setVisible("email", false);
    table.columnLayout.setOrder(["email", "age"]);
    expect([name.mock.calls.length, email.mock.calls.length]).toEqual([0, 3]);
    expect(table.getKeyedState("columnLayout", "email")).toBe("0:end:200");
    expect(table.getKeyedState("columnLayout", "name")).toBe("1:center:");
  });

  it("never re-runs the row pipeline or resets the page", () => {
    const table = makeLayout();
    table.pagination.setPage(1);
    const rows = table.computeRows(users);
    const runs = { ...stageRuns };
    seen.sources = [];
    table.columnLayout.setVisible("email", false);
    table.columnLayout.moveColumn("age", 0);
    table.columnLayout.pin("name", "start");
    table.columnLayout.setSize("name", 120);
    expect(table.computeRows(users)).toBe(rows);
    expect(stageRuns).toEqual(runs);
    expect(seen.sources).toEqual([]);
    expect(table.getFeatureState("pagination").pageIndex).toBe(1);
  });

  it("stays out of the request", () => {
    const table = makeLayout({ ...empty, hidden: ["age"] });
    expect(Object.keys(table.getRequest())).toEqual(["filtering", "sorting"]);
  });
});
