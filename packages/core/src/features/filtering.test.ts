import { describe, expect, it, vi } from "vitest";
import { defineTable } from "../define-table.js";
import { defineFeature, hasFeature } from "../feature.js";
import { createTableStore } from "../store.js";
import { createFilterDraft, filtering, isFiltered, remoteFiltering } from "./filtering.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
  readonly tags: readonly string[];
}

interface UserFilters {
  search: string;
  role?: "admin" | "member";
  tags?: readonly string[];
}

const users: readonly User[] = [
  { id: "a", name: "Ada", role: "admin", tags: ["vip"] },
  { id: "b", name: "Bob", role: "member", tags: [] },
  { id: "c", name: "Cara", role: "member", tags: ["vip", "new"] },
  { id: "d", name: "Dan", role: "admin", tags: ["new"] },
];

const matches = vi.fn<(user: User, filters: UserFilters) => boolean>((user, filters) => {
  if (!user.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
  if (filters.role !== undefined && user.role !== filters.role) return false;
  const tags = filters.tags ?? [];
  return tags.length === 0 || tags.some((tag) => user.tags.includes(tag));
});

/** Goes back to the first page when the matching rows change, as pagination does. */
const paging = defineFeature({
  name: "paging",
  state: {
    initial: { pageIndex: 0 },
    onRowsEffect: (effect, state) => (effect === "matching" ? { pageIndex: 0 } : state),
  },
  api: (ctx) => ({ setPage: (pageIndex: number) => ctx.setState({ pageIndex }) }),
});

const clientStore = (initial: UserFilters = { search: "" }) => {
  const def = defineTable<User>()({
    getRowId: (row) => row.id,
    columns: (col) => [col.key("name")],
    features: [filtering({ rows: matches }), paging()],
    initialState: { filtering: initial },
  });
  return createTableStore(def);
};

const ids = (store: ReturnType<typeof clientStore>) => store.computeRows(users).rows.map((row) => row.id);

describe("filtering", () => {
  it("filters data rows with the predicate", () => {
    const store = clientStore({ search: "a" });
    expect(ids(store)).toEqual(["a", "c", "d"]);
    store.filtering.set("role", "admin");
    expect(ids(store)).toEqual(["a", "d"]);
    expect(store.getRequest()).toEqual({});
  });

  it("keeps the input rows when every row matches", () => {
    const store = clientStore();
    const first = store.computeRows(users);
    expect(first.rows.map((row) => row.id)).toEqual(["a", "b", "c", "d"]);
    store.filtering.set("search", "x");
    store.filtering.set("search", "");
    expect(store.computeRows(users).rows).toBe(first.rows);
  });

  it("sets a value, an updater's value, and removes a key for undefined", () => {
    const store = clientStore();
    store.filtering.set("search", "da");
    store.filtering.set("search", (prev) => `${prev}n`);
    store.filtering.set("role", "admin");
    expect(store.filtering.get()).toEqual({ search: "dan", role: "admin" });
    store.filtering.set("role", undefined);
    expect(store.filtering.get()).toEqual({ search: "dan" });
    expect("role" in store.filtering.get()).toBe(false);
    store.filtering.set("role", "member");
    store.filtering.set("role", () => undefined);
    expect("role" in store.filtering.get()).toBe(false);
  });

  it("unsets an optional key", () => {
    const store = clientStore({ search: "", role: "member" });
    store.filtering.unset("role");
    expect(store.filtering.get()).toEqual({ search: "" });
    expect("role" in store.filtering.get()).toBe(false);
  });

  it("toggles items in an array filter", () => {
    const store = clientStore();
    store.filtering.toggle("tags", "vip");
    expect(store.filtering.get().tags).toEqual(["vip"]);
    expect(ids(store)).toEqual(["a", "c"]);
    store.filtering.toggle("tags", "new");
    expect(store.filtering.get().tags).toEqual(["vip", "new"]);
    store.filtering.toggle("tags", "vip");
    expect(store.filtering.get().tags).toEqual(["new"]);
    store.filtering.toggle("tags", "new");
    expect(store.filtering.get().tags).toEqual([]);
    expect(ids(store)).toEqual(["a", "b", "c", "d"]);
  });

  it("replaces all the filters", () => {
    const store = clientStore();
    store.filtering.replace({ search: "b", tags: [] });
    expect(store.filtering.get()).toEqual({ search: "b", tags: [] });
    store.filtering.replace((prev) => ({ ...prev, search: "c" }));
    expect(store.filtering.get()).toEqual({ search: "c", tags: [] });
  });

  it("clears to the cleared filters and resets to the starting ones", () => {
    const store = clientStore({ search: "a", tags: ["vip"] });
    store.filtering.set("role", "admin");
    store.filtering.clear();
    expect(store.filtering.get()).toEqual({ search: "", tags: [] });
    store.filtering.reset();
    expect(store.filtering.get()).toEqual({ search: "a", tags: ["vip"] });
  });

  it("clears to `empty` when given", () => {
    const def = defineTable<User>()({
      getRowId: (row) => row.id,
      columns: (col) => [col.key("name")],
      features: [filtering({ rows: matches, initial: { search: "a", role: "admin" }, empty: { search: "", role: "member" } })],
    });
    const store = createTableStore(def);
    store.filtering.clear();
    expect(store.filtering.get()).toEqual({ search: "", role: "member" });
    store.filtering.reset();
    expect(store.filtering.get()).toEqual({ search: "a", role: "admin" });
  });

  it("resets other features in the same change, and skips writes that change nothing", () => {
    const store = clientStore();
    store.paging.setPage(3);
    const states: unknown[] = [];
    const off = store.subscribeState(() => states.push(store.getState()));
    store.filtering.set("search", "a");
    expect(states).toEqual([{ filtering: { search: "a" }, paging: { pageIndex: 0 } }]);

    store.paging.setPage(2);
    states.length = 0;
    store.filtering.set("search", "a");
    store.filtering.replace({ search: "a" });
    store.filtering.set("role", undefined);
    expect(states).toEqual([]);
    expect(store.getState().paging).toEqual({ pageIndex: 2 });
    off();
  });

  it("uses `isEqual` to decide what changed", () => {
    const def = defineTable<User>()({
      getRowId: (row) => row.id,
      columns: (col) => [col.key("name")],
      features: [
        filtering({
          rows: matches,
          initial: { search: "" },
          isEqual: (a: UserFilters, b: UserFilters) => a.search.trim() === b.search.trim(),
        }),
      ],
    });
    const store = createTableStore(def);
    const before = store.filtering.get();
    store.filtering.set("search", "  ");
    expect(store.filtering.get()).toBe(before);
  });

  it("is found by hasFeature under either factory", () => {
    const store = clientStore();
    expect(hasFeature(store, filtering)).toBe(true);
    expect(hasFeature(store, remoteFiltering)).toBe(true);
    expect(filtering.featureName).toBe("filtering");
    expect(remoteFiltering.featureName).toBe("filtering");
  });
});

const remoteStore = () =>
  createTableStore(
      defineTable<User>()({
        getRowId: (row) => row.id,
        columns: (col) => [col.key("name")],
        features: [remoteFiltering<UserFilters>(), paging()],
      initialState: { filtering: { search: "" } },
    }),
  );

describe("remoteFiltering", () => {
  it("puts the filters in the request and filters no rows", () => {
    const store = remoteStore();
    expect(store.getRequest()).toEqual({ filtering: { search: "" } });
    const key = store.getRequestKey();
    store.filtering.set("search", "zzz");
    store.filtering.toggle("tags", "vip");
    expect(store.getRequest()).toEqual({ filtering: { search: "zzz", tags: ["vip"] } });
    expect(store.getRequestKey()).not.toBe(key);
    expect(store.computeRows(users).rows).toHaveLength(4);
  });

  it("has no row stage and starts from `initial`", () => {
    const feature = remoteFiltering({ initial: { q: "x" } });
    expect(feature.def.rowStage).toBeUndefined();
    expect(feature.def.state?.rowsEffect).toBe("matching");
    expect(filtering({ rows: () => true }).def.request).toBeUndefined();
    const store = createTableStore(defineTable<User>()({ getRowId: (row) => row.id, columns: [], features: [feature] }));
    expect(store.getFeatureState("filtering")).toEqual({ q: "x" });
  });

  it("resets other features in the same change", () => {
    const store = remoteStore();
    store.paging.setPage(4);
    store.filtering.set("search", "a");
    expect(store.getState()).toEqual({ filtering: { search: "a" }, paging: { pageIndex: 0 } });
  });
});

describe("isFiltered", () => {
  it("reads blank values as equal", () => {
    const baseline: UserFilters = { search: "" };
    expect(isFiltered({ search: "" }, baseline)).toBe(false);
    expect(isFiltered({ search: "", tags: [] }, baseline)).toBe(false);
    expect(isFiltered({ search: "", tags: [] }, { search: "", tags: ["vip"] })).toBe(true);
    expect(isFiltered({ search: "a" }, baseline)).toBe(true);
    expect(isFiltered({ search: "", role: "admin" }, baseline)).toBe(true);
    expect(isFiltered(baseline, { search: "", role: "admin" })).toBe(true);
  });

  it("compares arrays and plain objects by value", () => {
    expect(isFiltered({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toBe(false);
    expect(isFiltered({ tags: ["a", "b"] }, { tags: ["b", "a"] })).toBe(true);
    expect(isFiltered({ range: { min: 1, max: 2 } }, { range: { min: 1, max: 2 } })).toBe(false);
    expect(isFiltered({ range: { min: 1, max: 3 } }, { range: { min: 1, max: 2 } })).toBe(true);
  });
});

describe("createFilterDraft", () => {
  it("holds edits back from the table until commit", () => {
    matches.mockClear();
    const store = clientStore();
    store.paging.setPage(2);
    ids(store);
    const runs = matches.mock.calls.length;
    const draft = createFilterDraft(store);
    const listener = vi.fn<() => void>();
    draft.subscribe(listener);

    expect(draft.isDirty()).toBe(false);
    draft.set("role", "admin");
    draft.toggle("tags", "new");
    draft.set("search", (prev) => `${prev}d`);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(draft.get()).toEqual({ search: "d", role: "admin", tags: ["new"] });
    expect(draft.isDirty()).toBe(true);
    expect(store.filtering.get()).toEqual({ search: "" });
    expect(store.getState().paging).toEqual({ pageIndex: 2 });
    expect(ids(store)).toEqual(["a", "b", "c", "d"]);
    expect(matches.mock.calls.length).toBe(runs);

    draft.commit();
    expect(listener).toHaveBeenCalledTimes(4);
    expect(draft.isDirty()).toBe(false);
    expect(store.filtering.get()).toEqual({ search: "d", role: "admin", tags: ["new"] });
    expect(store.getState().paging).toEqual({ pageIndex: 0 });
    expect(ids(store)).toEqual(["d"]);
  });

  it("drops edits on discard and follows the table again", () => {
    const store = clientStore();
    const draft = createFilterDraft(store);
    draft.set("search", "zz");
    draft.unset("role");
    draft.discard();
    expect(draft.isDirty()).toBe(false);
    expect(draft.get()).toBe(store.filtering.get());
    store.filtering.set("search", "b");
    expect(draft.get()).toEqual({ search: "b" });
    draft.replace({ search: "c" });
    expect(draft.get()).toEqual({ search: "c" });
  });

  it("wakes no listener for a commit or discard without edits", () => {
    const store = clientStore();
    const draft = createFilterDraft(store);
    const listener = vi.fn<() => void>();
    const off = draft.subscribe(listener);
    draft.commit();
    draft.discard();
    expect(listener).not.toHaveBeenCalled();
    off();
    draft.set("search", "x");
    expect(listener).not.toHaveBeenCalled();
  });

  it("composes consecutive edits on a controlled filtering slice without losing updates", () => {
    let controlled: UserFilters = { search: "" };
    const queued: ((prev: UserFilters) => UserFilters)[] = [];
    const def = defineTable<User>()({
      getRowId: (u) => u.id,
      columns: (col) => [col.key("name")],
      features: [remoteFiltering<UserFilters>()],
      initialState: { filtering: { search: "" } },
    });
    const store = createTableStore(def, {
      bind: {
        filtering: {
          kind: "controlled",
          state: controlled,
          onStateChange: (updater) => queued.push(updater),
        },
      },
    });
    store.filtering.set("search", "alice");
    store.filtering.set("role", "admin");
    store.filtering.toggle("tags", "vip");
    for (const fn of queued) controlled = fn(controlled);
    expect(controlled).toEqual({ search: "alice", role: "admin", tags: ["vip"] });
  });
});
