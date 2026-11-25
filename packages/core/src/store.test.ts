import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ControlledSliceBinding, ExternalGroupBinding, ExternalSliceBinding } from "./bindings.js";
import { defineTable, type StateOf } from "./define-table.js";
import { makeDef, seen, stageRuns, users, type PageState, type User } from "./fixtures/table.js";
import { problem } from "./problem.js";
import { createTableStore, stableStringify } from "./store.js";

/** A value in an external store, with spies on the binding. */
function external<T>(value: T, server?: T) {
  let current = value;
  const listeners = new Set<() => void>();
  const binding = {
    get: vi.fn<() => T>(() => current),
    set: vi.fn<(next: T) => void>((next) => {
      current = next;
      listeners.forEach((listener) => listener());
    }),
    subscribe: vi.fn<(listener: () => void) => () => void>((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
    ...(server === undefined ? {} : { getServerSnapshot: () => server }),
  } satisfies ExternalSliceBinding<T>;
  const push = (next: T) => {
    current = next;
    listeners.forEach((listener) => listener());
  };
  return { binding, listeners, push };
}

const def = makeDef();
type SortEntry = StateOf<typeof def>["sorting"][number];

beforeEach(() => {
  stageRuns.filter = 0;
  stageRuns.sort = 0;
  stageRuns.window = 0;
});

describe("stableStringify", () => {
  it("sorts object keys at every depth", () => {
    expect(stableStringify({ b: 2, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":2}');
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it("writes what JSON writes for undefined", () => {
    expect(stableStringify({ a: undefined, b: [undefined] })).toBe('{"b":[null]}');
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify("x")).toBe('"x"');
  });
});

describe("createTableStore", () => {
  it("is the table: definition, feature names, meta and feature APIs", () => {
    const store = createTableStore(def, { meta: { owner: "admin" } });
    expect(store.def).toBe(def);
    expect([...store.featureNames]).toEqual(["sorting", "filtering", "pagination", "selection", "visibility", "widths", "edits"]);
    expect(store.meta).toEqual({ owner: "admin" });
    store.sorting.sortBy("name", true);
    expect(store.getFeatureState("sorting")).toEqual([{ id: "name", desc: true }]);
  });

  it("starts each slice from initialState, then the feature's initial", () => {
    const withState = defineTable<User>()({
      getRowId: (row) => row.id,
      columns: def.columns,
      features: def.features,
      initialState: { pagination: { pageIndex: 3, pageSize: 10 } },
    });
    const store = createTableStore(withState);
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 3, pageSize: 10 });
    expect(store.getFeatureState("filtering")).toEqual({ query: "" });
    expect(() =>
      // @ts-expect-error: no feature is named "nope"
      store.getFeatureState("nope"),
    ).toThrow(problem("feature:unknown", "nope"));
  });

  describe("subscriptions", () => {
    it("subscribes to owners only while something listens", () => {
      const sort = external<readonly SortEntry[]>([]);
      const store = createTableStore(def, { bind: { sorting: sort.binding } });
      expect(sort.binding.subscribe).not.toHaveBeenCalled();

      const listener = vi.fn<() => void>();
      const off = store.subscribeFeature("sorting", listener);
      expect(sort.binding.subscribe).toHaveBeenCalledTimes(1);
      sort.push([{ id: "age", desc: false }]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getFeatureState("sorting")).toEqual([{ id: "age", desc: false }]);

      off();
      expect(sort.listeners.size).toBe(0);
      sort.push([]);
      expect(listener).toHaveBeenCalledTimes(1);
      // Unsubscribed, a read still sees the owner's value.
      expect(store.getFeatureState("sorting")).toEqual([]);

      const again = vi.fn<() => void>();
      store.subscribeState(again);
      expect(sort.binding.subscribe).toHaveBeenCalledTimes(2);
      sort.push([{ id: "name", desc: true }]);
      expect(again).toHaveBeenCalledTimes(1);
    });

    it("keeps getState the same object until a slice changes, and wakes a state listener once per change", () => {
      const store = createTableStore(def);
      const state = store.getState();
      expect(store.getState()).toBe(state);
      expect(state.filtering).toEqual({ query: "" });
      const listener = vi.fn<() => void>();
      store.subscribeState(listener);
      store.pagination.setPage(1);
      store.selection.toggle("a");
      expect(listener).toHaveBeenCalledTimes(2);
      // A filter write changes three slices in one patch.
      store.filtering.setQuery("a");
      expect(listener).toHaveBeenCalledTimes(3);
      expect(store.getState()).not.toBe(state);
      expect(store.getState().pagination.pageIndex).toBe(0);
    });

    it("wakes only the row, column or cell that changed", () => {
      const store = createTableStore(def);
      const rowA = vi.fn<() => void>();
      const rowB = vi.fn<() => void>();
      store.subscribeRow("selection", "a", rowA);
      store.subscribeKeyed("selection", "b", rowB);
      store.selection.toggle("a");
      expect(rowA).toHaveBeenCalledTimes(1);
      expect(rowB).not.toHaveBeenCalled();
      expect(store.getKeyedState("selection", "a")).toBe(true);
      expect(store.getKeyedState("selection", "b")).toBe(false);

      const name = vi.fn<() => void>();
      const age = vi.fn<() => void>();
      store.subscribeColumn("widths", "name", name);
      store.subscribeColumn("widths", "age", age);
      store.widths.setWidth("age", 120);
      expect([name.mock.calls.length, age.mock.calls.length]).toEqual([0, 1]);

      const cellA = vi.fn<() => void>();
      const cellB = vi.fn<() => void>();
      store.subscribeCell("edits", "a", "name", cellA);
      store.subscribeCell("edits", "b", "name", cellB);
      store.edits.edit("b", "name", "Bea");
      expect([cellA.mock.calls.length, cellB.mock.calls.length]).toEqual([0, 1]);

      expect(() => store.subscribeRow("sorting", "a", vi.fn<() => void>())).toThrow(problem("feature:unknown", "sorting"));
    });

    it("lets go of a keyed feature's owner when its last key listener leaves", () => {
      const selected = external<Readonly<Record<string, boolean>>>({});
      const store = createTableStore(def, { bind: { selection: selected.binding } });
      const offA = store.subscribeRow("selection", "a", vi.fn<() => void>());
      const offB = store.subscribeRow("selection", "b", vi.fn<() => void>());
      expect(selected.binding.subscribe).toHaveBeenCalledTimes(1);
      offA();
      expect(selected.listeners.size).toBe(1);
      offB();
      expect(selected.listeners.size).toBe(0);
      const listener = vi.fn<() => void>();
      store.subscribeRow("selection", "a", listener);
      selected.push({ a: true });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getKeyedState("selection", "a")).toBe(true);
    });
  });

  describe("rows effect", () => {
    it("resets other features in the same patch, with one call to a group owner", () => {
      let value = { filtering: { query: "" }, pagination: { pageIndex: 0, pageSize: 2 } as PageState };
      const listeners = new Set<() => void>();
      const group = {
        kind: "group",
        get: () => value,
        set: vi.fn<(next: typeof value) => void>((next) => {
          value = next;
          listeners.forEach((listener) => listener());
        }),
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      } satisfies ExternalGroupBinding<typeof value>;
      const store = createTableStore(def, { bind: { filtering: group, pagination: group } });
      store.pagination.setPage(3);
      store.selection.toggle("a");
      group.set.mockClear();
      const state = vi.fn<() => void>();
      store.subscribeState(state);

      store.filtering.setQuery("a");
      expect(group.set).toHaveBeenCalledTimes(1);
      expect(group.set).toHaveBeenCalledWith({ filtering: { query: "a" }, pagination: { pageIndex: 0, pageSize: 2 } });
      expect(store.getFeatureState("selection")).toEqual({});
      expect(state).toHaveBeenCalledTimes(1);
    });

    it("leaves other features alone for a view or none effect", () => {
      const store = createTableStore(def);
      store.pagination.setPage(2);
      store.selection.toggle("a");
      store.sorting.sortBy("name");
      store.visibility.hide("email");
      store.filtering.setQuietly("b");
      expect(store.getFeatureState("pagination").pageIndex).toBe(2);
      expect(store.getFeatureState("selection")).toEqual({ a: true });
    });

    it("hands onRowsEffect the effect and the writing feature's name", () => {
      const store = createTableStore(def);
      seen.sources = [];
      store.filtering.setQuery("x");
      store.sorting.sortBy("name");
      store.visibility.hide("email");
      expect(seen.sources).toEqual(["matching:filtering", "view:sorting"]);
    });
  });

  describe("request", () => {
    it("holds only features with a request seam, and keeps its object while the key holds", () => {
      const store = createTableStore(def);
      const request = store.getRequest();
      expect(request).toEqual({ sorting: { sort: [] }, filtering: { query: "" } });
      expect(store.getRequestKey()).toBe('{"filtering":{"query":""},"sorting":{"sort":[]}}');
      const listener = vi.fn<() => void>();
      store.subscribeRequest(listener);

      store.visibility.hide("email");
      store.pagination.setPage(1);
      expect(store.getRequest()).toBe(request);
      store.sorting.sortBy("name");
      const sorted = store.getRequest();
      expect(sorted).toEqual({ sorting: { sort: ["name"] }, filtering: { query: "" } });
      // An equal sort in a new array keeps the request.
      store.sorting.sortBy("name");
      expect(store.getRequest()).toBe(sorted);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("reads the server snapshot for the server request", () => {
      const sort = external<readonly SortEntry[]>([{ id: "age", desc: true }], []);
      const store = createTableStore(def, { bind: { sorting: sort.binding } });
      expect(store.getRequest().sorting.sort).toEqual(["-age"]);
      expect(store.getServerRequest().sorting.sort).toEqual([]);
      expect(store.getServerRequestKey()).toBe('{"filtering":{"query":""},"sorting":{"sort":[]}}');
      expect(store.getServerState().sorting).toEqual([]);
      expect(store.getServerFeatureState("sorting")).toEqual([]);
    });
  });

  describe("columns", () => {
    it("keeps the columns object until a column stage's state changes", () => {
      const store = createTableStore(def);
      const columns = store.getColumns();
      const listener = vi.fn<() => void>();
      store.subscribeColumns(listener);
      store.sorting.sortBy("name");
      expect(store.getColumns()).toBe(columns);
      store.visibility.hide("email");
      expect(listener).toHaveBeenCalledTimes(1);
      expect(store.getColumns().visibleColumns.map((column) => column.id)).toEqual(["name", "age"]);
      expect(store.getColumns().allColumns.map((column) => column.id)).toEqual(["name", "email", "age"]);
    });

    it("reads the server snapshot for the server columns", () => {
      const hidden = external<readonly string[]>([], ["age"]);
      const store = createTableStore(def, { bind: { visibility: hidden.binding } });
      expect(store.getColumns().visibleColumns).toHaveLength(3);
      expect(store.getServerColumns().visibleColumns.map((column) => column.id)).toEqual(["name", "email"]);
    });
  });

  describe("normalize", () => {
    it("heals stale initial state", () => {
      const stale = defineTable<User>()({
        getRowId: (row) => row.id,
        columns: def.columns,
        features: def.features,
        initialState: { visibility: ["email", "gone"] },
      });
      const store = createTableStore(stale);
      expect(store.getFeatureState("visibility")).toEqual(["email"]);
    });

    it("heals state from an owner and keeps the healed value while the owner's holds", () => {
      const hidden = external<readonly string[]>(["ghost", "age"]);
      const store = createTableStore(def, { bind: { visibility: hidden.binding } });
      const healed = store.getFeatureState("visibility");
      expect(healed).toEqual(["age"]);
      expect(store.getFeatureState("visibility")).toBe(healed);
      expect(store.getColumns().visibleColumns.map((column) => column.id)).toEqual(["name", "email"]);
      // Writes start from the healed value.
      store.visibility.hide("email");
      expect(hidden.binding.set).toHaveBeenCalledWith(["age", "email"]);
    });
  });

  describe("updateOptions", () => {
    it("keeps the store while omitColumns, meta and controlled slices change, and wakes listeners on flush", () => {
      const onStateChange = vi.fn<(updater: (prev: readonly SortEntry[]) => readonly SortEntry[]) => void>();
      const controlled = (state: readonly SortEntry[]): ControlledSliceBinding<readonly SortEntry[]> => ({
        kind: "controlled",
        state,
        onStateChange,
      });
      const store = createTableStore(def, { bind: { sorting: controlled([]) }, omitColumns: ["email"] });
      expect(store.getColumns().allColumns.map((column) => column.id)).toEqual(["name", "age"]);
      const columns = vi.fn<() => void>();
      const sort = vi.fn<() => void>();
      store.subscribeColumns(columns);
      store.subscribeFeature("sorting", sort);

      store.sorting.sortBy("age");
      expect(onStateChange).toHaveBeenCalledTimes(1);
      const next = onStateChange.mock.calls[0]?.[0]([]) ?? [];
      expect(next).toEqual([{ id: "age", desc: false }]);

      store.updateOptions({ bind: { sorting: controlled(next) }, omitColumns: new Set(["age"]), meta: { page: "users" } });
      expect(sort).not.toHaveBeenCalled();
      expect(columns).not.toHaveBeenCalled();
      expect(store.getFeatureState("sorting")).toBe(next);
      expect(store.meta).toEqual({ page: "users" });
      store.flush();
      expect(sort).toHaveBeenCalledTimes(1);
      expect(columns).toHaveBeenCalledTimes(1);
      expect(store.getColumns().allColumns.map((column) => column.id)).toEqual(["name", "email"]);

      // The same ids in a new set change nothing.
      store.updateOptions({ omitColumns: ["age"] });
      store.flush();
      expect(columns).toHaveBeenCalledTimes(1);
    });
  });

  describe("computeRows", () => {
    it("runs the row stages over the data and counts matching rows", () => {
      const store = createTableStore(def);
      store.filtering.setQuery("a");
      const view = store.computeRows(users);
      expect(view.rows.map((row) => row.id)).toEqual(["a", "c"]);
      expect(view.matchingCount).toBe(3);
      store.pagination.setPage(1);
      expect(store.computeRows(users).rows.map((row) => row.id)).toEqual(["d"]);
    });

    it("runs no row stage for writes that don't touch the rows", () => {
      const store = createTableStore(def);
      const view = store.computeRows(users);
      expect(stageRuns).toEqual({ filter: 1, sort: 1, window: 1 });
      store.visibility.hide("email");
      store.selection.toggle("a");
      store.widths.setWidth("name", 200);
      expect(store.computeRows(users)).toBe(view);
      expect(stageRuns).toEqual({ filter: 1, sort: 1, window: 1 });
      store.sorting.sortBy("name", true);
      expect(store.computeRows(users).rows.map((row) => row.id)).toEqual(["d", "c"]);
      expect(stageRuns).toEqual({ filter: 1, sort: 2, window: 2 });
    });

    it("leaves omitted columns out of what stages see", () => {
      const store = createTableStore(def, { omitColumns: ["email"] });
      store.computeRows(users);
      expect(seen.columns).toEqual(["name", "age"]);
    });

    it("compares the data's request key with the table's", () => {
      const store = createTableStore(def);
      const key = store.getRequestKey();
      expect(store.computeRows(users, { requestKey: key }).isStale).toBe(false);
      store.filtering.setQuery("z");
      expect(store.computeRows(users, { requestKey: key }).isStale).toBe(true);
    });
  });
});
