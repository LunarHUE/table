import { createTableStore } from "@lunarhue/table-core";
import { createRoot, createSignal, flush, getOwner, type Setter } from "solid-js";
import { describe, expect, it, vi } from "vitest";
import { usersTable, type Filters, type UsersState } from "./fixtures/users.js";

type SortingState = UsersState["sorting"];
type PaginationState = UsersState["pagination"];
import { signal, signalGroup } from "./solid.js";

interface Query {
  readonly filtering: Filters;
  readonly pagination: PaginationState;
}

describe("signal", () => {
  it("starts the table from the signal and writes table changes back", () => {
    const [get, set] = createSignal<SortingState>([{ id: "name", desc: true }]);
    const table = createTableStore(usersTable, { bind: { sorting: signal(get, set) } });
    expect(table.getFeatureState("sorting")).toEqual([{ id: "name", desc: true }]);

    table.sorting.toggle("name");
    flush();
    expect(get()).toEqual([]);
  });

  it("copies a signal change into the table once Solid flushes", () => {
    const [get, set] = createSignal<SortingState>([]);
    const table = createTableStore(usersTable, { bind: { sorting: signal(get, set) } });
    const listener = vi.fn<() => void>();
    const stop = table.subscribeFeature("sorting", listener);
    flush();

    set([{ id: "createdAt", desc: false }]);
    flush();
    expect(table.getFeatureState("sorting")).toEqual([{ id: "createdAt", desc: false }]);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it("makes its root on the first listener and disposes it on the last", () => {
    const [get, set] = createSignal<SortingState>([]);
    const listener = vi.fn<() => void>();
    const binding = signal(get, set);
    const stop = binding.subscribe(listener);
    flush();
    listener.mockClear();

    set([{ id: "name", desc: false }]);
    flush();
    expect(listener).toHaveBeenCalledTimes(1);

    stop();
    set([]);
    flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("subscribes outside the caller's owner, so disposing that owner leaves it running", () => {
    const [get, set] = createSignal<SortingState>([]);
    const listener = vi.fn<() => void>();
    const binding = signal(get, set);
    let stop: (() => void) | undefined;
    createRoot((dispose) => {
      stop = binding.subscribe(listener);
      expect(getOwner()).not.toBeNull();
      dispose();
    });
    flush();
    listener.mockClear();
    set([{ id: "name", desc: false }]);
    flush();
    expect(listener).toHaveBeenCalledTimes(1);
    stop?.();
  });

  it("writes from inside a computation", () => {
    const [get, set] = createSignal<SortingState>([]);
    const binding = signal(get, set);
    createRoot(() => binding.set([{ id: "name", desc: false }]));
    flush();
    expect(get()).toEqual([{ id: "name", desc: false }]);
  });
});

describe("signalGroup", () => {
  it("writes a new filter and the page reset in one signal write", () => {
    const [get, set] = createSignal<Query>({ filtering: { search: "" }, pagination: { pageIndex: 2, pageSize: 10 } });
    const writes = vi.fn<Setter<Query>>(set);
    const group = signalGroup(get, writes);
    expect(group.kind).toBe("group");
    const table = createTableStore(usersTable, { bind: { filtering: group, pagination: group } });
    expect(table.getFeatureState("pagination").pageIndex).toBe(2);

    table.filtering.set("search", "ada");
    flush();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(get()).toEqual({ filtering: { search: "ada" }, pagination: { pageIndex: 0, pageSize: 10 } });
    expect(table.getFeatureState("pagination").pageIndex).toBe(0);
  });

  it("copies a signal change into every slice it owns", () => {
    const [get, set] = createSignal<Query>({ filtering: { search: "" }, pagination: { pageIndex: 0, pageSize: 10 } });
    const group = signalGroup(get, set);
    const table = createTableStore(usersTable, { bind: { filtering: group, pagination: group } });
    const stop = table.subscribeState(() => {});
    flush();
    set({ filtering: { search: "x", role: "member" }, pagination: { pageIndex: 1, pageSize: 25 } });
    flush();
    expect(table.getFeatureState("filtering")).toEqual({ search: "x", role: "member" });
    expect(table.getFeatureState("pagination")).toEqual({ pageIndex: 1, pageSize: 25 });
    stop();
  });
});
