import { describe, expect, it, vi } from "vitest";
import {
  createSliceCoordinator,
  type ControlledGroupBinding,
  type ControlledSliceBinding,
  type ExternalGroupBinding,
  type ExternalSliceBinding,
} from "./bindings.js";
import { createCells } from "./cells.js";

interface Sort {
  readonly id: string;
  readonly desc: boolean;
}

interface Pagination {
  readonly pageIndex: number;
  readonly pageSize: number;
}

interface State {
  sorting: readonly Sort[];
  filter: string;
  pagination: Pagination;
  visibility: Readonly<Record<string, boolean>>;
  selection: readonly string[];
}

const initial: State = {
  sorting: [],
  filter: "",
  pagination: { pageIndex: 0, pageSize: 10 },
  visibility: {},
  selection: [],
};

/** A store with get, set and subscribe, counting what the table does to it. */
function externalStore<T>(start: T) {
  let value = start;
  const listeners = new Set<() => void>();
  const binding = {
    get: vi.fn<() => T>(() => value),
    set: vi.fn<(next: T) => void>((next) => {
      value = next;
      for (const listener of listeners) listener();
    }),
    subscribe: vi.fn<(listener: () => void) => () => void>((listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  } satisfies ExternalSliceBinding<T>;
  return {
    binding,
    listeners,
    /** Changes the value from outside the table. */
    write(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

/** A React-like owner: updaters queue during a handler and apply on commit. */
function controlledOwner<T>(start: T) {
  let state = start;
  const queue: ((prev: T) => T)[] = [];
  const onStateChange = vi.fn<(updater: (prev: T) => T) => void>((updater) => {
    queue.push(updater);
  });
  return {
    onStateChange,
    binding: (): ControlledSliceBinding<T> => ({ kind: "controlled", state, onStateChange }),
    commit: () => {
      for (const updater of queue.splice(0)) state = updater(state);
      return state;
    },
    get state() {
      return state;
    },
  };
}

/** `controlledOwner` for a group of slices. */
function controlledGroupOwner<T extends object>(start: T) {
  const owner = controlledOwner(start);
  return {
    onStateChange: owner.onStateChange,
    commit: owner.commit,
    group: (): ControlledGroupBinding<T> => ({
      kind: "controlled-group",
      state: owner.state,
      onStateChange: owner.onStateChange,
    }),
  };
}

describe("internal slices", () => {
  it("starts from `initial` and applies values and updaters", () => {
    const table = createSliceCoordinator({ initial });
    expect(table.getSnapshot("filter")).toBe("");
    table.applyPatch({ filter: "abc" });
    table.applyPatch({ selection: (prev) => [...prev, "r1"] });
    expect(table.getSnapshot("filter")).toBe("abc");
    expect(table.getSnapshot("selection")).toEqual(["r1"]);
  });

  it("wakes each slice's listeners once per patch, after the whole patch", () => {
    const table = createSliceCoordinator({ initial });
    const seen: string[] = [];
    table.subscribe("filter", () => seen.push(`filter:${table.getSnapshot("pagination").pageIndex}`));
    const sorting = vi.fn<() => void>();
    table.subscribe("sorting", sorting);
    table.applyPatch({ filter: "a", pagination: (prev) => ({ ...prev, pageIndex: 3 }) });
    expect(seen).toEqual(["filter:3"]);
    expect(sorting).not.toHaveBeenCalled();
  });

  it("keeps the snapshot when an updater returns the same value", () => {
    const table = createSliceCoordinator({ initial });
    const listener = vi.fn<() => void>();
    table.subscribe("pagination", listener);
    table.applyPatch({ pagination: (prev) => prev });
    expect(table.getSnapshot("pagination")).toBe(initial.pagination);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns `initial` as the server snapshot", () => {
    const table = createSliceCoordinator({ initial });
    table.applyPatch({ filter: "changed" });
    expect(table.getServerSnapshot("filter")).toBe("");
  });

  it("shares batches with cells passed in", () => {
    const cells = createCells();
    const [, , , batch] = cells;
    const table = createSliceCoordinator({ initial, cells });
    const listener = vi.fn<() => void>();
    table.subscribe("filter", listener);
    batch(() => {
      table.applyPatch({ filter: "a" });
      table.applyPatch({ filter: "b" });
      expect(listener).not.toHaveBeenCalled();
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("external slices", () => {
  it("does nothing to the store when created", () => {
    const store = externalStore<string>("outside");
    createSliceCoordinator({ initial, bindings: { filter: store.binding } });
    expect(store.binding.get).not.toHaveBeenCalled();
    expect(store.binding.subscribe).not.toHaveBeenCalled();
  });

  it("reads the store, and writes to it on a patch", () => {
    const store = externalStore<string>("outside");
    const table = createSliceCoordinator({ initial, bindings: { filter: store.binding } });
    expect(table.getSnapshot("filter")).toBe("outside");
    table.applyPatch({ filter: (prev) => `${prev}!` });
    expect(store.binding.set).toHaveBeenCalledWith("outside!");
    expect(table.getSnapshot("filter")).toBe("outside!");
  });

  it("skips `set` when the value doesn't change", () => {
    const store = externalStore<string>("same");
    const table = createSliceCoordinator({ initial, bindings: { filter: store.binding } });
    table.applyPatch({ filter: "same" });
    expect(store.binding.set).not.toHaveBeenCalled();
  });

  it("subscribes with the first listener and unsubscribes with the last", () => {
    const store = externalStore<string>("a");
    const table = createSliceCoordinator({ initial, bindings: { filter: store.binding } });
    const first = vi.fn<() => void>();
    const offFirst = table.subscribe("filter", first);
    const offOther = table.subscribe("selection", () => {});
    expect(store.binding.subscribe).toHaveBeenCalledTimes(1);
    expect(store.listeners.size).toBe(1);

    store.write("b");
    expect(first).toHaveBeenCalledTimes(1);
    expect(table.getSnapshot("filter")).toBe("b");

    offFirst();
    offFirst();
    expect(store.listeners.size).toBe(1);
    offOther();
    expect(store.listeners.size).toBe(0);

    // Unsubscribed, a read still sees the store's current value.
    store.write("c");
    expect(table.getSnapshot("filter")).toBe("c");

    const again = vi.fn<() => void>();
    table.subscribe("filter", again);
    expect(store.binding.subscribe).toHaveBeenCalledTimes(2);
    store.write("d");
    expect(again).toHaveBeenCalledTimes(1);
    expect(table.getSnapshot("filter")).toBe("d");
  });

  it("catches up with changes made while nobody listened", () => {
    const store = externalStore<string>("a");
    const table = createSliceCoordinator({ initial, bindings: { filter: store.binding } });
    expect(table.getSnapshot("filter")).toBe("a");
    store.write("b");
    const listener = vi.fn<() => void>();
    table.subscribe("filter", listener);
    expect(table.getSnapshot("filter")).toBe("b");
    expect(listener).not.toHaveBeenCalled();
  });

  it("uses getServerSnapshot, then get, for the server snapshot", () => {
    const store = externalStore<string>("client");
    const table = createSliceCoordinator({
      initial,
      bindings: {
        filter: { ...store.binding, getServerSnapshot: () => "server" },
        selection: externalStore<readonly string[]>(["r1"]).binding,
      },
    });
    expect(table.getServerSnapshot("filter")).toBe("server");
    expect(table.getServerSnapshot("selection")).toEqual(["r1"]);
  });
});

describe("controlled slices", () => {
  it("lands two commands from one handler", () => {
    const owner = controlledOwner<readonly string[]>([]);
    const table = createSliceCoordinator({ initial, bindings: { selection: owner.binding() } });

    table.applyPatch({ selection: (prev) => [...prev, "r1"] });
    table.applyPatch({ selection: (prev) => [...prev, "r2"] });
    // The table doesn't change a controlled slice by itself.
    expect(table.getSnapshot("selection")).toEqual([]);

    expect(owner.commit()).toEqual(["r1", "r2"]);
    table.updateControlled({ selection: owner.binding() });
    expect(table.getSnapshot("selection")).toEqual(["r1", "r2"]);
  });

  it("turns a plain value into an updater", () => {
    const owner = controlledOwner("x");
    const table = createSliceCoordinator({ initial, bindings: { filter: owner.binding() } });
    table.applyPatch({ filter: "y" });
    const [updater] = owner.onStateChange.mock.calls[0] ?? [];
    expect(updater?.("ignored")).toBe("y");
  });

  it("wakes no listeners in updateControlled until flush", () => {
    const owner = controlledOwner("a");
    const table = createSliceCoordinator({ initial, bindings: { filter: owner.binding() } });
    const listener = vi.fn<() => void>();
    table.subscribe("filter", listener);
    const before = owner.binding();

    table.applyPatch({ filter: "b" });
    owner.commit();
    table.updateControlled({ filter: owner.binding() });
    expect(listener).not.toHaveBeenCalled();
    expect(table.getSnapshot("filter")).toBe("b");
    expect(before.state).toBe("a");

    table.flush();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("uses the controlled state as the server snapshot", () => {
    const owner = controlledOwner("server");
    const table = createSliceCoordinator({ initial, bindings: { filter: owner.binding() } });
    expect(table.getServerSnapshot("filter")).toBe("server");
  });

  it("refuses a slice that changes owner", () => {
    const owner = controlledOwner("a");
    const table = createSliceCoordinator({ initial, bindings: { filter: owner.binding() } });
    expect(() => table.updateControlled({})).toThrow(/bind:owner|Slice "filter"/);
    expect(() => table.updateControlled({ filter: owner.binding(), selection: controlledOwner<readonly string[]>([]).binding() })).toThrow(
      /selection/,
    );
    expect(() => table.updateControlled({ filter: externalStore("a").binding })).toThrow(/filter/);
  });
});

describe("group owners", () => {
  type UrlState = Pick<State, "sorting" | "filter" | "pagination">;

  function urlStore(start: UrlState) {
    let value = start;
    const listeners = new Set<() => void>();
    const binding = {
      kind: "group",
      get: vi.fn<() => UrlState>(() => value),
      getServerSnapshot: () => start,
      set: vi.fn<(next: UrlState) => void>((next) => {
        value = next;
        for (const listener of listeners) listener();
      }),
      subscribe: vi.fn<(listener: () => void) => () => void>((listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }),
    } satisfies ExternalGroupBinding<UrlState>;
    return {
      binding,
      listeners,
      write(next: UrlState) {
        value = next;
        for (const listener of listeners) listener();
      },
    };
  }

  const startUrl: UrlState = { sorting: [], filter: "", pagination: { pageIndex: 4, pageSize: 10 } };

  it("sends a filter change and a page reset to the URL in one call", () => {
    const url = urlStore(startUrl);
    const table = createSliceCoordinator({
      initial,
      bindings: { sorting: url.binding, filter: url.binding, pagination: url.binding },
    });
    table.applyPatch({ filter: "abc", pagination: (prev) => ({ ...prev, pageIndex: 0 }) });
    expect(url.binding.set).toHaveBeenCalledTimes(1);
    expect(url.binding.set).toHaveBeenCalledWith({
      sorting: startUrl.sorting,
      filter: "abc",
      pagination: { pageIndex: 0, pageSize: 10 },
    });
    expect(table.getSnapshot("pagination").pageIndex).toBe(0);
    expect(table.getSnapshot("sorting")).toBe(startUrl.sorting);
  });

  it("skips `set` when no slice in the group changes", () => {
    const url = urlStore(startUrl);
    const table = createSliceCoordinator({ initial, bindings: { filter: url.binding, sorting: url.binding } });
    table.applyPatch({ filter: "", sorting: (prev) => prev });
    expect(url.binding.set).not.toHaveBeenCalled();
  });

  it("subscribes to the group once and wakes only the slices that changed", () => {
    const url = urlStore(startUrl);
    const table = createSliceCoordinator({
      initial,
      bindings: { sorting: url.binding, filter: url.binding, pagination: url.binding },
    });
    const filter = vi.fn<() => void>();
    const sorting = vi.fn<() => void>();
    table.subscribe("filter", filter);
    table.subscribe("sorting", sorting);
    expect(url.binding.subscribe).toHaveBeenCalledTimes(1);
    url.write({ ...startUrl, filter: "typed" });
    expect(filter).toHaveBeenCalledTimes(1);
    expect(sorting).not.toHaveBeenCalled();
  });

  it("reads each slice's server snapshot from the group", () => {
    const url = urlStore(startUrl);
    const table = createSliceCoordinator({ initial, bindings: { pagination: url.binding } });
    expect(table.getServerSnapshot("pagination")).toBe(startUrl.pagination);
  });

  it("composes controlled group updates in one handler", () => {
    const owner = controlledGroupOwner<Pick<State, "filter" | "pagination">>({
      filter: "",
      pagination: { pageIndex: 2, pageSize: 10 },
    });
    const group = owner.group();
    const table = createSliceCoordinator({ initial, bindings: { filter: group, pagination: group } });
    table.applyPatch({ filter: "a", pagination: (prev) => ({ ...prev, pageIndex: 0 }) });
    table.applyPatch({ pagination: (prev) => ({ ...prev, pageSize: 50 }) });
    expect(owner.onStateChange).toHaveBeenCalledTimes(2);
    expect(owner.commit()).toEqual({ filter: "a", pagination: { pageIndex: 0, pageSize: 50 } });

    const next = owner.group();
    table.updateControlled({ filter: next, pagination: next });
    expect(table.getSnapshot("pagination")).toEqual({ pageIndex: 0, pageSize: 50 });
  });

  it("refuses a controlled group split across two objects in a later render", () => {
    const owner = controlledGroupOwner<Pick<State, "filter" | "pagination">>({ filter: "", pagination: initial.pagination });
    const group = owner.group();
    const table = createSliceCoordinator({ initial, bindings: { filter: group, pagination: group } });
    expect(() => table.updateControlled({ filter: owner.group(), pagination: owner.group() })).toThrow(/pagination/);
  });
});

describe("mixed owners", () => {
  it("sends one call to each owner and keeps the rest inside", () => {
    let url: Pick<State, "filter" | "pagination"> = { filter: "", pagination: { pageIndex: 3, pageSize: 10 } };
    const urlSet = vi.fn<(next: typeof url) => void>((next) => {
      url = next;
    });
    const urlBinding: ExternalGroupBinding<typeof url> = {
      kind: "group",
      get: () => url,
      set: urlSet,
      subscribe: () => () => {},
    };
    const storage = externalStore<State["visibility"]>({ price: true });
    const table = createSliceCoordinator({
      initial,
      bindings: { filter: urlBinding, pagination: urlBinding, visibility: storage.binding },
    });
    const selection = vi.fn<() => void>();
    table.subscribe("selection", selection);

    table.applyPatch({
      filter: "x",
      pagination: (prev) => ({ ...prev, pageIndex: 0 }),
      visibility: (prev) => ({ ...prev, price: false }),
      selection: ["r1"],
    });

    expect(urlSet).toHaveBeenCalledTimes(1);
    expect(storage.binding.set).toHaveBeenCalledTimes(1);
    expect(storage.binding.set).toHaveBeenCalledWith({ price: false });
    expect(selection).toHaveBeenCalledTimes(1);
    expect(table.getSnapshot("selection")).toEqual(["r1"]);
    expect(table.getSnapshot("filter")).toBe("x");
    expect(table.getSnapshot("visibility")).toEqual({ price: false });
  });
});
