import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindGroup, type ExternalBinding, type ExternalGroupBinding } from "../bindings.js";
import { defineColumn, type AnyColumn } from "../column.js";
import { defineTable } from "../define-table.js";
import { filtering, sorting, stageRuns, users, type User } from "../fixtures/table.js";
import { problem } from "../problem.js";
import { createTableStore } from "../store.js";
import { pagination, type PaginationState } from "./pagination.js";
import {
  computeSelectAllState,
  computeSelectionSummary,
  isRowSelected,
  isSelected,
  selectable,
  selection,
  type SelectionOptions,
  type SelectionState,
} from "./selection.js";

const columns = defineTable<User>()({ getRowId: (row) => row.id, columns: (col) => [col.key("name", { sortable: true })] }).columns;

const makeTable = (options?: SelectionOptions, initial?: SelectionState) =>
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [sorting(), filtering(), pagination(), selection(options)],
    ...(initial ? { initialState: { selection: initial } } : {}),
  });

const make = (options?: SelectionOptions, initial?: SelectionState) => createTableStore(makeTable(options, initial));

const ids = (...list: string[]): SelectionState => ({ mode: "ids", ids: list });
const all = (...except: string[]): SelectionState => ({ mode: "all", except });

/** The selection after a filter write, from a starting state. */
const afterFilter = (options: SelectionOptions | undefined, start: SelectionState) => {
  const store = make(options, start);
  store.filtering.setQuery("a");
  return store.getFeatureState("selection");
};

describe("multi mode", () => {
  it("starts empty, frozen, and multi", () => {
    const store = make();
    expect(store.selection.mode).toBe("multi");
    const state = store.getFeatureState("selection");
    expect(state).toEqual(ids());
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("toggles rows on and off without duplicates", () => {
    const store = make();
    store.selection.toggle("a");
    store.selection.toggle("b");
    expect(store.getFeatureState("selection")).toEqual(ids("a", "b"));
    store.selection.toggle("a");
    expect(store.getFeatureState("selection")).toEqual(ids("b"));
  });

  it("sets many rows at once and keeps the state when nothing changes", () => {
    const store = make();
    store.selection.set(["a", "b", "a"], true);
    expect(store.getFeatureState("selection")).toEqual(ids("a", "b"));
    const before = store.getFeatureState("selection");
    store.selection.set(["b"], true);
    store.selection.set(["z"], false);
    expect(store.getFeatureState("selection")).toBe(before);
    store.selection.set(["a", "z"], false);
    expect(store.getFeatureState("selection")).toEqual(ids("b"));
  });

  it("selects all matching rows and toggles exceptions out and back in", () => {
    const store = make();
    store.selection.toggle("a");
    store.selection.selectAllMatching();
    expect(store.getFeatureState("selection")).toEqual(all());
    store.selection.toggle("b");
    store.selection.toggle("c");
    expect(store.getFeatureState("selection")).toEqual(all("b", "c"));
    expect(store.getKeyedState("selection", "b")).toBe(false);
    expect(store.getKeyedState("selection", "a")).toBe(true);
    store.selection.toggle("b");
    expect(store.getFeatureState("selection")).toEqual(all("c"));
    store.selection.set(["a", "d"], false);
    expect(store.getFeatureState("selection")).toEqual(all("c", "a", "d"));
    store.selection.set(["c", "a"], true);
    expect(store.getFeatureState("selection")).toEqual(all("d"));
  });

  it("keeps the state when selecting all twice", () => {
    const store = make();
    store.selection.selectAllMatching();
    const before = store.getFeatureState("selection");
    store.selection.selectAllMatching();
    expect(store.getFeatureState("selection")).toBe(before);
  });

  it("clears to empty ids, keeping an already empty state", () => {
    const store = make();
    const empty = store.getFeatureState("selection");
    store.selection.clear();
    expect(store.getFeatureState("selection")).toBe(empty);
    store.selection.selectAllMatching();
    store.selection.clear();
    expect(store.getFeatureState("selection")).toBe(empty);
  });
});

describe("single mode", () => {
  it("keeps at most one row", () => {
    const store = make({ mode: "single" });
    expect(store.selection.mode).toBe("single");
    store.selection.toggle("a");
    store.selection.toggle("b");
    expect(store.getFeatureState("selection")).toEqual(ids("b"));
    store.selection.toggle("b");
    expect(store.getFeatureState("selection")).toEqual(ids());
  });

  it("sets the last id, and clears when deselecting the selected row", () => {
    const store = make({ mode: "single" });
    store.selection.set(["a", "c"], true);
    expect(store.getFeatureState("selection")).toEqual(ids("c"));
    const before = store.getFeatureState("selection");
    store.selection.set([], true);
    store.selection.set(["c"], true);
    store.selection.set(["a"], false);
    expect(store.getFeatureState("selection")).toBe(before);
    store.selection.set(["a", "c"], false);
    expect(store.getFeatureState("selection")).toEqual(ids());
  });

  it("ignores selectAllMatching", () => {
    const store = make({ mode: "single" });
    store.selection.toggle("a");
    store.selection.selectAllMatching();
    expect(store.getFeatureState("selection")).toEqual(ids("a"));
  });
});

describe("store wiring", () => {
  beforeEach(() => {
    stageRuns.filter = 0;
    stageRuns.sort = 0;
    stageRuns.window = 0;
  });

  it("wakes only the toggled row and doesn't run the row pipeline", () => {
    const store = make();
    const first = store.computeRows(users);
    const runs = { ...stageRuns };
    const a = vi.fn<() => void>();
    const b = vi.fn<() => void>();
    store.subscribeRow("selection", "a", a);
    store.subscribeRow("selection", "b", b);

    store.selection.toggle("a");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    expect(store.getKeyedState("selection", "a")).toBe(true);
    expect(store.computeRows(users).rows).toBe(first.rows);
    expect(stageRuns).toEqual(runs);
  });

  it("stays out of the server request", () => {
    const store = make();
    store.selection.toggle("a");
    expect(store.getRequest()).not.toHaveProperty("selection");
    expect(store.getRequestKey()).not.toContain("selection");
  });

  it("clears 'all' in the same patch as a write that changes the matching rows", () => {
    let value = {
      filtering: { query: "" },
      pagination: { pageIndex: 0, pageSize: 10 } as PaginationState,
      selection: all("b"),
    };
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
    const store = createTableStore(makeTable(), { bind: { filtering: group, pagination: group, selection: group } });

    store.filtering.setQuery("a");
    expect(group.set).toHaveBeenCalledTimes(1);
    expect(group.set).toHaveBeenCalledWith({
      filtering: { query: "a" },
      pagination: { pageIndex: 0, pageSize: 10 },
      selection: ids(),
    });
  });

  it("follows the reset policy on matching writes", () => {
    expect(afterFilter(undefined, all("b"))).toEqual(ids());
    expect(afterFilter(undefined, ids("a"))).toEqual(ids("a"));
    expect(afterFilter({ resetOnRowsChange: "always" }, all())).toEqual(ids());
    expect(afterFilter({ resetOnRowsChange: "always" }, ids("a"))).toEqual(ids());
    expect(afterFilter({ resetOnRowsChange: "never" }, all("b"))).toEqual(all("b"));
    expect(afterFilter({ resetOnRowsChange: "never" }, ids("a"))).toEqual(ids("a"));
  });

  it("keeps the selection on view and none writes", () => {
    const store = make({ resetOnRowsChange: "always" });
    store.selection.selectAllMatching();
    store.sorting.sortBy("name");
    store.pagination.setPage(1);
    store.filtering.setQuietly("b");
    expect(store.getFeatureState("selection")).toEqual(all());
  });
});

interface Url {
  readonly filtering: { readonly query: string };
  readonly pagination: PaginationState;
}

const page = (pageIndex: number): PaginationState => ({ pageIndex, pageSize: 10 });
const at = (query: string, pageIndex = 0): Url => ({ filtering: { query }, pagination: page(pageIndex) });

/** The URL as an external group: `navigate` is a link or the back button, `set` is the table writing. */
function url(start: Url) {
  let value = start;
  const listeners = new Set<() => void>();
  const set = vi.fn<(next: Url) => void>((next) => {
    value = next;
    listeners.forEach((listener) => listener());
  });
  const bind = bindGroup(["filtering", "pagination"] as const, {
    get: () => value,
    set,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  const navigate = (next: Url) => {
    value = next;
    listeners.forEach((listener) => listener());
  };
  return { bind, set, navigate };
}

/** The selection after the URL changes the filter, from a starting state. */
const afterNavigation = (options: SelectionOptions | undefined, start: SelectionState) => {
  const owner = url(at("a"));
  const store = createTableStore(makeTable(options, start), { bind: owner.bind });
  store.subscribeFeature("selection", () => {});
  owner.navigate(at("b"));
  return store.getFeatureState("selection");
};

describe("owner changes", () => {
  it("clears 'all' when an external group changes the filter, without writing back to it", () => {
    const owner = url(at("a"));
    const store = createTableStore(makeTable(), { bind: owner.bind });
    const listener = vi.fn<() => void>();
    store.subscribeFeature("selection", listener);
    store.selection.selectAllMatching();
    listener.mockClear();

    owner.navigate(at("b", 2));
    expect(store.getFeatureState("selection")).toEqual(ids());
    expect(listener).toHaveBeenCalledTimes(1);
    // The URL set the page along with the filter, so its page stands.
    expect(store.getFeatureState("pagination")).toEqual(page(2));
    expect(owner.set).not.toHaveBeenCalled();
  });

  it("answers a change made while nobody listened when the first listener comes", () => {
    const owner = url(at("a"));
    const store = createTableStore(makeTable(), { bind: owner.bind });
    store.selection.selectAllMatching();
    expect(store.getFeatureState("filtering")).toEqual({ query: "a" });

    owner.navigate(at("b"));
    store.subscribeFeature("selection", () => {});
    expect(store.getFeatureState("selection")).toEqual(ids());
  });

  it("clears 'all' and goes to the first page when a single external binding changes the filter", () => {
    let value = { query: "a" };
    const listeners = new Set<() => void>();
    const binding: ExternalBinding<{ readonly query: string }> = {
      get: () => value,
      set: (next) => (value = next),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const store = createTableStore(makeTable(), { bind: { filtering: binding } });
    store.subscribeState(() => {});
    store.pagination.setPage(3);
    store.selection.selectAllMatching();

    value = { query: "b" };
    listeners.forEach((listener) => listener());
    expect(store.getFeatureState("selection")).toEqual(ids());
    expect(store.getFeatureState("pagination").pageIndex).toBe(0);
  });

  it("keeps the selection when the owner hands over an equal filter, or changes only the page", () => {
    const owner = url(at("a"));
    const store = createTableStore(makeTable(), { bind: owner.bind });
    store.subscribeFeature("selection", () => {});
    store.selection.selectAllMatching();

    owner.navigate(at("a"));
    owner.navigate(at("a", 4));
    expect(store.getFeatureState("selection")).toEqual(all());
  });

  it("keeps listed ids under the default policy and follows the other policies", () => {
    expect(afterNavigation(undefined, ids("a"))).toEqual(ids("a"));
    expect(afterNavigation(undefined, all("b"))).toEqual(ids());
    expect(afterNavigation({ resetOnRowsChange: "always" }, ids("a"))).toEqual(ids());
    expect(afterNavigation({ resetOnRowsChange: "never" }, all())).toEqual(all());
  });

  it("doesn't answer the table's own write twice", () => {
    const owner = url(at("a", 2));
    const store = createTableStore(makeTable(), { bind: owner.bind });
    store.subscribeFeature("selection", () => {});
    store.filtering.setQuery("b");
    expect(owner.set).toHaveBeenCalledTimes(1);
    expect(owner.set).toHaveBeenCalledWith(at("b"));
    // A selection made after the write survives the owner's echo of it.
    store.selection.selectAllMatching();
    expect(store.getFeatureState("selection")).toEqual(all());
  });

  it("leaves a selection the same owner holds to that owner", () => {
    let value = { filtering: { query: "a" }, selection: all() };
    const listeners = new Set<() => void>();
    const set = vi.fn<(next: typeof value) => void>();
    const bind = bindGroup(["filtering", "selection"] as const, {
      get: () => value,
      set,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    const store = createTableStore(makeTable(), { bind });
    store.subscribeFeature("selection", () => {});

    // Back to an entry whose URL selected every row for its own filter.
    value = { filtering: { query: "b" }, selection: all("x") };
    listeners.forEach((listener) => listener());
    expect(store.getFeatureState("selection")).toEqual(all("x"));
    expect(set).not.toHaveBeenCalled();
  });

  it("sends the reset to a selection held by another owner", () => {
    const owner = url(at("a"));
    let picked: SelectionState = all();
    const set = vi.fn<(next: SelectionState) => void>((next) => (picked = next));
    const selectionOwner: ExternalBinding<SelectionState> = { get: () => picked, set, subscribe: () => () => {} };
    const store = createTableStore(makeTable(), { bind: { ...owner.bind, selection: selectionOwner } });
    store.subscribeFeature("selection", () => {});

    owner.navigate(at("b"));
    expect(set).toHaveBeenCalledTimes(1);
    expect(picked).toEqual(ids());
    expect(owner.set).not.toHaveBeenCalled();
  });

  it("answers a controlled group's change at flush, not in updateOptions", () => {
    const onStateChange = vi.fn<(updater: (prev: Url) => Url) => void>();
    const controlled = (state: Url) => bindGroup(["filtering", "pagination"] as const, { state, onStateChange });
    const store = createTableStore(makeTable(), { bind: controlled(at("a")) });
    const listener = vi.fn<() => void>();
    store.subscribeFeature("selection", listener);
    store.selection.selectAllMatching();
    listener.mockClear();

    store.updateOptions({ bind: controlled(at("b", 1)) });
    expect(store.getFeatureState("selection")).toEqual(all());
    expect(listener).not.toHaveBeenCalled();

    store.flush();
    expect(store.getFeatureState("selection")).toEqual(ids());
    expect(store.getFeatureState("pagination")).toEqual(page(1));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onStateChange).not.toHaveBeenCalled();

    // A new but equal state from the next render changes nothing.
    store.selection.selectAllMatching();
    store.updateOptions({ bind: controlled(at("b", 1)) });
    store.flush();
    expect(store.getFeatureState("selection")).toEqual(all());
  });
});

describe("selectable", () => {
  it("makes a selection part with a page scope by default", () => {
    expect(selectable()).toEqual({ feature: "selection", config: { scope: "page" } });
    expect(selectable({ scope: "matching" }).config).toEqual({ scope: "matching" });
  });

  it("works on a table with selection and throws feature:missing without it", () => {
    const select = defineColumn("select", { parts: [selectable()] });
    const table = defineTable<User>()({ getRowId: (row) => row.id, columns: [select, ...columns], features: [selection()] });
    expect(table.columns.map((column) => column.id)).toEqual(["select", "name"]);
    // Columns typed as `AnyColumn` hide the requirement from the compiler, as columns built at runtime do.
    const untyped: readonly AnyColumn<User>[] = [select, ...columns];
    expect(() => defineTable<User>()({ getRowId: (row) => row.id, columns: untyped, features: [sorting()] })).toThrow(
      problem("feature:missing", "selection"),
    );
  });
});

describe("selectors", () => {
  it("reads a row's selection in both modes", () => {
    expect(isRowSelected(ids("a"), "a")).toBe(true);
    expect(isRowSelected(ids("a"), "b")).toBe(false);
    expect(isRowSelected(all("a"), "a")).toBe(false);
    expect(isRowSelected(all("a"), "b")).toBe(true);
    expect(isSelected("b")(all())).toBe(true);
  });
});

describe("computeSelectAllState", () => {
  const rows = ["a", "b", "c"];

  it("is off with no rows or nothing selected", () => {
    expect(computeSelectAllState(ids(), [])).toEqual({ checked: false, indeterminate: false });
    expect(computeSelectAllState(all(), [])).toEqual({ checked: false, indeterminate: false });
    expect(computeSelectAllState(ids(), rows)).toEqual({ checked: false, indeterminate: false });
    expect(computeSelectAllState(ids(), rows, "matching")).toEqual({ checked: false, indeterminate: false });
  });

  it("is indeterminate when some rows in scope are selected", () => {
    expect(computeSelectAllState(ids("a", "z"), rows)).toEqual({ checked: false, indeterminate: true });
    expect(computeSelectAllState(all("b"), rows)).toEqual({ checked: false, indeterminate: true });
    expect(computeSelectAllState(ids("a"), rows, "matching")).toEqual({ checked: false, indeterminate: true });
    expect(computeSelectAllState(all("z"), rows, "matching")).toEqual({ checked: false, indeterminate: true });
  });

  it("is checked, and not indeterminate, when all rows in scope are selected", () => {
    expect(computeSelectAllState(ids("c", "b", "a"), rows)).toEqual({ checked: true, indeterminate: false });
    expect(computeSelectAllState(all("z"), rows)).toEqual({ checked: true, indeterminate: false });
    expect(computeSelectAllState(all(), rows, "matching")).toEqual({ checked: true, indeterminate: false });
    expect(computeSelectAllState(ids("a", "b", "c"), rows, "matching")).toEqual({ checked: false, indeterminate: true });
  });
});

describe("computeSelectionSummary", () => {
  it("sums up ids", () => {
    expect(computeSelectionSummary(ids("a", "z"), ["a", "b"])).toEqual({
      count: 2,
      visibleCount: 1,
      ids: ["a", "z"],
      except: [],
      target: { kind: "ids", ids: ["a", "z"] },
    });
  });

  it("sums up all-except, with and without a total", () => {
    expect(computeSelectionSummary(all("b"), ["a", "b", "c"], 10)).toEqual({
      count: 9,
      visibleCount: 2,
      ids: [],
      except: ["b"],
      target: { kind: "all", except: ["b"] },
    });
    expect(computeSelectionSummary(all("b"), ["a"]).count).toBeUndefined();
    expect(computeSelectionSummary(all("a", "b"), [], 1).count).toBe(0);
  });

  it("gives JSON-safe targets", () => {
    const { target } = computeSelectionSummary(all("b"), []);
    expect(JSON.parse(JSON.stringify(target))).toEqual(target);
  });
});
