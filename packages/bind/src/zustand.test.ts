import { createTableStore } from "@lunarhue/table-core";
import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { usersTable, type Filters, type UsersState } from "./fixtures/users.js";

type SortingState = UsersState["sorting"];
type PaginationState = UsersState["pagination"];
import { zustand, zustandGroup } from "./zustand.js";

interface AppState {
  sorting: SortingState;
  query: { filtering: Filters; pagination: PaginationState };
  theme: string;
}

const start = (): AppState => ({
  sorting: [],
  query: { filtering: { search: "" }, pagination: { pageIndex: 2, pageSize: 10 } },
  theme: "dark",
});

describe("zustand", () => {
  it("starts the table from the store and writes table changes back", () => {
    const store = createStore<AppState>()(() => ({ ...start(), sorting: [{ id: "name", desc: true }] }));
    const table = createTableStore(usersTable, {
      bind: { sorting: zustand(store, { select: (s) => s.sorting, update: (sorting) => ({ sorting }) }) },
    });
    expect(table.getFeatureState("sorting")).toEqual([{ id: "name", desc: true }]);

    table.sorting.toggle("name");
    expect(store.getState().sorting).toEqual([]);
    expect(store.getState().theme).toBe("dark");
  });

  it("copies store changes into the table while it has listeners", () => {
    const store = createStore<AppState>()(start);
    const table = createTableStore(usersTable, {
      bind: { sorting: zustand(store, { select: (s) => s.sorting, update: (sorting) => ({ sorting }) }) },
    });
    const listener = vi.fn<() => void>();
    const stop = table.subscribeFeature("sorting", listener);
    store.setState({ sorting: [{ id: "createdAt", desc: false }] });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(table.getFeatureState("sorting")).toEqual([{ id: "createdAt", desc: false }]);
    stop();
  });

  it("subscribes to the store only while the table has listeners", () => {
    const store = createStore<AppState>()(start);
    const subscribe = vi.spyOn(store, "subscribe");
    const table = createTableStore(usersTable, {
      bind: { sorting: zustand(store, { select: (s) => s.sorting, update: (sorting) => ({ sorting }) }) },
    });
    expect(subscribe).not.toHaveBeenCalled();
    const stop = table.subscribeFeature("sorting", () => {});
    expect(subscribe).toHaveBeenCalledTimes(1);
    stop();
    const listeners = vi.fn<(state: AppState, previous: AppState) => void>();
    store.subscribe(listeners);
    store.setState({ theme: "light" });
    // Only the test's own listener is left.
    expect(listeners).toHaveBeenCalledTimes(1);
  });

  it("keeps a derived slice's object while isEqual finds it the same", () => {
    const store = createStore<AppState>()(start);
    const binding = zustand(store, {
      select: (s) => ({ pageIndex: s.query.pagination.pageIndex, pageSize: s.query.pagination.pageSize }),
      update: (pagination, s) => ({ query: { ...s.query, pagination } }),
      isEqual: (a, b) => a.pageIndex === b.pageIndex && a.pageSize === b.pageSize,
    });
    const first = binding.get();
    store.setState({ theme: "light" });
    expect(binding.get()).toBe(first);
    store.setState({ query: { ...store.getState().query, pagination: { pageIndex: 0, pageSize: 10 } } });
    expect(binding.get()).not.toBe(first);
    expect(binding.get()).toEqual({ pageIndex: 0, pageSize: 10 });
  });

  it("binds the whole state when given no options", () => {
    const store = createStore<SortingState>()(() => []);
    const table = createTableStore(usersTable, { bind: { sorting: zustand(store) } });
    table.sorting.toggle("name");
    expect(store.getState()).toEqual([{ id: "name", desc: false }]);
  });

  it("passes getServerSnapshot through", () => {
    const store = createStore<AppState>()(start);
    const table = createTableStore(usersTable, {
      bind: {
        sorting: zustand(store, {
          select: (s) => s.sorting,
          update: (sorting) => ({ sorting }),
          getServerSnapshot: (): SortingState => [{ id: "name", desc: false }],
        }),
      },
    });
    expect(table.getServerFeatureState("sorting")).toEqual([{ id: "name", desc: false }]);
  });
});

describe("zustandGroup", () => {
  it("writes a new filter and the page reset in one setState", () => {
    const store = createStore<AppState>()(start);
    const setState = vi.spyOn(store, "setState");
    const group = zustandGroup(store, {
      select: (s) => s.query,
      update: (query) => ({ query }),
    });
    const table = createTableStore(usersTable, { bind: { filtering: group, pagination: group } });
    expect(table.getFeatureState("pagination").pageIndex).toBe(2);

    table.filtering.set("role", "admin");
    expect(setState).toHaveBeenCalledTimes(1);
    expect(store.getState().query).toEqual({
      filtering: { search: "", role: "admin" },
      pagination: { pageIndex: 0, pageSize: 10 },
    });
    expect(table.getFeatureState("pagination").pageIndex).toBe(0);
  });

  it("is a group binding", () => {
    const store = createStore<AppState>()(start);
    expect(zustandGroup(store, { select: (s) => s.query, update: (query) => ({ query }) }).kind).toBe("group");
  });
});
