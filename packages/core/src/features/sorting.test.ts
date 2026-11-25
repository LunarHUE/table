import { describe, expect, it, vi } from "vitest";
import type { RowLike } from "../contract.js";
import { defineTable } from "../define-table.js";
import { pagination } from "../fixtures/table.js";
import { createTableStore } from "../store.js";
import {
  getSortDir,
  getSortIndex,
  remoteSorting,
  sortDir,
  sorting,
  type SortComparator,
  type SortingOptions,
  type SortingState,
} from "./sorting.js";

interface Person {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly age: number | null;
  readonly joined: Date | undefined;
  readonly active: boolean;
}

const day = (n: number) => new Date(Date.UTC(2026, 0, n));

const people: readonly Person[] = [
  { id: "a", name: "ada", email: "a@x", age: 36, joined: day(3), active: true },
  { id: "b", name: "Bob", email: "b@x", age: null, joined: day(1), active: false },
  { id: "c", name: "cara", email: "c@x", age: 29, joined: undefined, active: true },
  { id: "d", name: "Dan", email: "d@x", age: 36, joined: day(2), active: false },
  { id: "e", name: "eve", email: "e@x", age: Number.NaN, joined: new Date(Number.NaN), active: true },
];

const columns = [
  { id: "name", sortable: true, getValue: (row: Person) => row.name },
  { id: "email", getValue: (row: Person) => row.email },
  { id: "age", sortable: true, getValue: (row: Person) => row.age },
  { id: "joined", sortable: true, getValue: (row: Person) => row.joined },
  { id: "active", sortable: true, getValue: (row: Person) => row.active },
  { id: "mixed", sortable: true, getValue: (row: Person) => (row.active ? row.name : row.age) },
  { id: "actions", sortable: true },
] as const;

type Sort = readonly { readonly id: "name" | "age" | "joined" | "active" | "mixed" | "actions"; readonly desc: boolean }[];
const byLower: SortComparator = (a, b) => String(a).toLowerCase().localeCompare(String(b).toLowerCase(), "en");
/** A row stage context reads no other feature. */
const noFeatures = (name: never) => name;

const makeTable = (options?: SortingOptions, initial?: Sort) =>
  createTableStore(
    defineTable<Person>()({
      getRowId: (row) => row.id,
      columns,
      features: [sorting(options)],
      ...(initial ? { initialState: { sorting: initial } } : {}),
    }),
  );

const makeRemote = (options?: Parameters<typeof remoteSorting>[0]) =>
  createTableStore(
    defineTable<Person>()({
      getRowId: (row) => row.id,
      columns,
      features: [remoteSorting(options)],
    }),
  );

const ids = (table: ReturnType<typeof makeTable>, data: readonly Person[] = people) => table.computeRows(data).rows.map((row) => row.id);

describe("selectors", () => {
  const state: SortingState = [
    { id: "age", desc: true },
    { id: "name", desc: false },
  ];

  it("read a column's direction and place in the sort list", () => {
    expect(getSortDir(state, "age")).toBe("desc");
    expect(getSortDir(state, "name")).toBe("asc");
    expect(getSortDir(state, "email")).toBe(false);
    expect(getSortIndex(state, "name")).toBe(1);
    expect(getSortIndex(state, "email")).toBe(-1);
    expect(sortDir("age")(state)).toBe("desc");
  });
});

describe.each([
  ["sorting", makeTable],
  ["remoteSorting", makeRemote],
] as const)("%s api", (_, make) => {
  it("toggles a column from unsorted to ascending, descending and back", () => {
    const table = make();
    const dirs = [];
    for (let i = 0; i < 4; i++) {
      table.sorting.toggle("name");
      dirs.push(getSortDir(table.getFeatureState("sorting"), "name"));
    }
    expect(dirs).toEqual(["asc", "desc", false, "asc"]);
  });

  it("cycles between ascending and descending with enableRemoval: false", () => {
    const table = make({ enableRemoval: false });
    const dirs = [];
    for (let i = 0; i < 4; i++) {
      table.sorting.toggle("name");
      dirs.push(getSortDir(table.getFeatureState("sorting"), "name"));
    }
    expect(dirs).toEqual(["asc", "desc", "asc", "desc"]);
  });

  it("sorts by one column unless the write asks for multi", () => {
    const table = make();
    table.sorting.toggle("name");
    table.sorting.toggle("age");
    expect(table.getFeatureState("sorting")).toEqual([{ id: "age", desc: false }]);
    table.sorting.toggle("name", { multi: true });
    table.sorting.toggle("age", { multi: true });
    expect(table.getFeatureState("sorting")).toEqual([
      { id: "age", desc: true },
      { id: "name", desc: false },
    ]);
    table.sorting.toggle("age", { multi: true });
    expect(table.getFeatureState("sorting")).toEqual([{ id: "name", desc: false }]);
  });

  it("ignores multi writes when the feature has multi: false", () => {
    const table = make({ multi: false });
    table.sorting.toggle("name");
    table.sorting.toggle("age", { multi: true });
    expect(table.getFeatureState("sorting")).toEqual([{ id: "age", desc: false }]);
  });

  it("sets, replaces and clears", () => {
    const table = make();
    table.sorting.set("age", "desc");
    expect(table.getFeatureState("sorting")).toEqual([{ id: "age", desc: true }]);
    table.sorting.set("name", "asc", { multi: true });
    table.sorting.set("age", "asc", { multi: true });
    expect(table.getFeatureState("sorting")).toEqual([
      { id: "age", desc: false },
      { id: "name", desc: false },
    ]);
    table.sorting.set("age", null, { multi: true });
    expect(table.getFeatureState("sorting")).toEqual([{ id: "name", desc: false }]);
    table.sorting.set("name", null);
    expect(table.getFeatureState("sorting")).toEqual([]);
    const next: SortingState = [{ id: "joined", desc: true }];
    table.sorting.replace(next);
    expect(table.getFeatureState("sorting")).toBe(next);
    table.sorting.clear();
    expect(table.getFeatureState("sorting")).toEqual([]);
  });

  it("keeps the state object when a write changes nothing", () => {
    const table = make();
    table.sorting.set("age", "desc");
    const before = table.getFeatureState("sorting");
    table.sorting.set("age", "desc");
    table.sorting.set("email", null, { multi: true });
    expect(table.getFeatureState("sorting")).toBe(before);
  });

  it("drops ids of unknown and non-sortable columns, and repeats", () => {
    const table = make();
    const valid: SortingState = [{ id: "name", desc: false }];
    table.sorting.replace(valid);
    expect(table.getFeatureState("sorting")).toBe(valid);
    table.sorting.replace([
      { id: "email", desc: false },
      { id: "age", desc: true },
      { id: "gone", desc: false },
      { id: "age", desc: false },
    ]);
    expect(table.getFeatureState("sorting")).toEqual([{ id: "age", desc: true }]);
  });

  it("wakes only the columns whose direction changed", () => {
    const table = make();
    const name = vi.fn<() => void>();
    const email = vi.fn<() => void>();
    const age = vi.fn<() => void>();
    table.subscribeColumn("sorting", "name", name);
    table.subscribeColumn("sorting", "email", email);
    table.subscribeColumn("sorting", "age", age);
    table.sorting.toggle("name");
    table.flush();
    expect([name.mock.calls.length, email.mock.calls.length, age.mock.calls.length]).toEqual([1, 0, 0]);
    expect(table.getKeyedState("sorting", "name")).toBe("asc");
    table.sorting.toggle("age", { multi: true });
    table.flush();
    expect([name.mock.calls.length, email.mock.calls.length, age.mock.calls.length]).toEqual([1, 0, 1]);
    table.sorting.toggle("age");
    table.flush();
    expect([name.mock.calls.length, email.mock.calls.length, age.mock.calls.length]).toEqual([2, 0, 2]);
  });

  it("goes back to the first page in the same change", () => {
    const table = createTableStore(
      defineTable<Person>()({
        getRowId: (row) => row.id,
        columns,
        features: [make === makeTable ? sorting() : remoteSorting(), pagination()],
      }),
    );
    table.pagination.setPage(2);
    table.flush();
    const states: [SortingState, number][] = [];
    table.subscribeState(() => {
      const state = table.getState();
      states.push([state.sorting, state.pagination.pageIndex]);
    });
    table.sorting.toggle("name");
    table.flush();
    expect(states).toEqual([[[{ id: "name", desc: false }], 0]]);
  });
});

describe("sorting rows", () => {
  it("leaves rows alone without a sort, and omits sorting from the request", () => {
    const table = makeTable();
    expect(table.computeRows(people).rows.map((row) => row.original)).toEqual(people);
    expect(table.getRequest()).toEqual({});
    table.sorting.toggle("name");
    expect(table.getRequest()).toEqual({});
    expect(table.getRequestKey()).toBe("{}");
  });

  it("compares strings by code unit, in both directions", () => {
    const table = makeTable({}, [{ id: "name", desc: false }]);
    expect(ids(table)).toEqual(["b", "d", "a", "c", "e"]);
    table.sorting.toggle("name");
    expect(ids(table)).toEqual(["e", "c", "a", "d", "b"]);
  });

  it("puts null, undefined and NaN last by default, in either direction", () => {
    const table = makeTable({}, [{ id: "age", desc: false }]);
    expect(ids(table)).toEqual(["c", "a", "d", "b", "e"]);
    table.sorting.set("age", "desc");
    expect(ids(table)).toEqual(["a", "d", "c", "b", "e"]);
  });

  it("puts missing values first with nulls: first", () => {
    const table = makeTable({ nulls: "first" }, [{ id: "age", desc: true }]);
    expect(ids(table)).toEqual(["b", "e", "a", "d", "c"]);
  });

  it("compares dates and booleans", () => {
    const table = makeTable({}, [{ id: "joined", desc: false }]);
    expect(ids(table)).toEqual(["b", "d", "a", "c", "e"]);
    table.sorting.set("active", "asc");
    expect(ids(table)).toEqual(["b", "d", "a", "c", "e"]);
    table.sorting.set("active", "desc");
    expect(ids(table)).toEqual(["a", "c", "e", "b", "d"]);
  });

  it("breaks ties with later entries, then keeps the data order", () => {
    const table = makeTable({}, [{ id: "active", desc: false }]);
    expect(ids(table)).toEqual(["b", "d", "a", "c", "e"]);
    table.sorting.set("name", "desc", { multi: true });
    expect(ids(table)).toEqual(["d", "b", "e", "c", "a"]);
    table.sorting.replace([{ id: "actions", desc: true }]);
    expect(ids(table)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("uses a column's comparator in place of the built-in one", () => {
    const table = makeTable({ comparators: { name: byLower } }, [{ id: "name", desc: false }]);
    expect(ids(table)).toEqual(["a", "b", "c", "d", "e"]);
    table.sorting.toggle("name");
    expect(ids(table)).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("orders values of different types by type name", () => {
    const table = makeTable({}, [{ id: "mixed", desc: false }]);
    expect(ids(table)).toEqual(["d", "a", "c", "e", "b"]);
  });

  it("moves detail rows with the row above them, and returns the same rows when the order holds", () => {
    const n = { id: "n", sortable: true, getValue: (row: { n: number }) => row.n };
    const rows: readonly RowLike[] = [
      { kind: "detail", id: "lead", index: 0, depth: 0, parentId: "x", original: null },
      { kind: "data", id: "b", index: 1, depth: 0, parentId: null, original: { n: 2 } },
      { kind: "detail", id: "b", index: 2, depth: 0, parentId: "b", original: { n: 2 } },
      { kind: "data", id: "a", index: 3, depth: 0, parentId: null, original: { n: 1 } },
    ];
    const feature = sorting();
    const run = feature.def.rowStage?.run;
    const out = run?.(rows, {
      state: [{ id: "n", desc: false }],
      options: feature.options,
      columns: [n],
      getFeatureState: noFeatures,
    });
    expect(out?.map((row) => `${row.kind}:${row.id}`)).toEqual(["detail:lead", "data:a", "data:b", "detail:b"]);
    const inOrder = rows.slice(3);
    const same = run?.(inOrder, {
      state: [{ id: "n", desc: false }],
      options: feature.options,
      columns: [n],
      getFeatureState: noFeatures,
    });
    expect(same).toBe(inOrder);
  });
});

describe("remoteSorting", () => {
  it("puts the sort list in the request and leaves the rows in data order", () => {
    const table = makeRemote();
    expect(table.getRequest()).toEqual({ sorting: [] });
    table.sorting.toggle("name");
    table.sorting.toggle("age", { multi: true });
    expect(table.getRequest()).toEqual({
      sorting: [
        { id: "name", desc: false },
        { id: "age", desc: false },
      ],
    });
    expect(table.getRequestKey()).toBe('{"sorting":[{"desc":false,"id":"name"},{"desc":false,"id":"age"}]}');
    expect(table.computeRows(people).rows.map((row) => row.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("has no row stage", () => {
    expect(remoteSorting().def.rowStage).toBeUndefined();
    expect(sorting().def.request).toBeUndefined();
  });
});
