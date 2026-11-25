import { describe, expect, it, vi } from "vitest";
import type { ExternalGroupBinding } from "../bindings.js";
import type { RowLike } from "../contract.js";
import { defineTable } from "../define-table.js";
import { defineFeature } from "../feature.js";
import { filtering, sorting, users, type User } from "../fixtures/table.js";
import { createTableStore } from "../store.js";
import { computePaginationMeta, pagination, remotePagination, type PaginationOptions, type PaginationState } from "./pagination.js";

const columns = defineTable<User>()({ getRowId: (row) => row.id, columns: (col) => [col.key("name", { sortable: true })] }).columns;

const clientTable = (options?: PaginationOptions, initial?: PaginationState) =>
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [sorting(), filtering(), pagination(options)],
    ...(initial ? { initialState: { pagination: initial } } : {}),
  });

const serverTable = (options?: PaginationOptions) =>
  defineTable<User>()({ getRowId: (row) => row.id, columns, features: [sorting(), filtering(), remotePagination(options)] });

const ids = (view: { readonly rows: readonly { readonly id: string }[] }) => view.rows.map((row) => row.id);

const detail = (row: RowLike, n: number): RowLike => ({
  kind: "detail",
  id: `${row.id}:detail${n}`,
  index: row.index,
  depth: row.depth + 1,
  parentId: row.id,
  original: row.original,
});

const noneExpanded: Readonly<Record<string, number>> = {};

/** A flatten stage that puts as many detail rows under a row as its state says. */
const expanding = defineFeature({
  name: "expanding",
  state: { initial: noneExpanded },
  rowStage: {
    phase: "flatten",
    run: (rows, ctx) =>
      rows.flatMap((row) => [row, ...Array.from({ length: ctx.state[row.id] ?? 0 }, (_, n) => detail(row, n + 1))]),
  },
});

/** A flatten stage that puts two child data rows, the first with a detail row, under "a", and a detail row above every row. */
const tree = defineFeature({
  name: "tree",
  state: { initial: null },
  rowStage: {
    phase: "flatten",
    run: (rows) => {
      const first = rows[0];
      if (!first) return rows;
      const child = (n: number): RowLike => ({ kind: "data", id: `a.${n}`, index: n - 1, depth: 1, parentId: "a", original: first.original });
      const orphan: RowLike = { ...detail(first, 0), id: "orphan", parentId: null };
      return rows.flatMap((row) => (row.id === "a" ? [orphan, row, child(1), detail(child(1), 1), child(2)] : [row]));
    },
  },
});

const detailTable = (pageSize: number, expanded: Readonly<Record<string, number>>, pageIndex = 0) =>
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [sorting(), filtering(), expanding(), pagination({ sizes: [pageSize] })],
    initialState: { expanding: expanded, pagination: { pageIndex, pageSize } },
  });

describe("pagination", () => {
  it("starts on page 0 with the first allowed size, or 10", () => {
    expect(createTableStore(clientTable()).getFeatureState("pagination")).toEqual({ pageIndex: 0, pageSize: 10 });
    expect(createTableStore(clientTable({ sizes: [2, 4] })).getFeatureState("pagination")).toEqual({ pageIndex: 0, pageSize: 2 });
    const given = createTableStore(clientTable({ sizes: [2, 4] }, { pageIndex: 1, pageSize: 3 }));
    expect(given.getFeatureState("pagination")).toEqual({ pageIndex: 1, pageSize: 3 });
  });

  it("cuts the page out of the rows and keeps the count from before the window", () => {
    const store = createTableStore(clientTable({ sizes: [2] }));
    const first = store.computeRows(users);
    expect(ids(first)).toEqual(["a", "b"]);
    expect(first.matchingCount).toBe(4);
    expect(first.totalCount).toBe(4);
    store.pagination.setPage(1);
    expect(ids(store.computeRows(users))).toEqual(["c", "d"]);
  });

  it("gives no rows for empty data or a page past the end", () => {
    const store = createTableStore(clientTable({ sizes: [2] }));
    expect(store.computeRows([]).rows).toEqual([]);
    store.pagination.setPage(9);
    const view = store.computeRows(users);
    expect(view.rows).toEqual([]);
    expect(view.matchingCount).toBe(4);
  });

  it("clamps and truncates page indexes", () => {
    const store = createTableStore(clientTable());
    store.pagination.setPage(-3);
    expect(store.getFeatureState("pagination").pageIndex).toBe(0);
    store.pagination.setPage(Number.NaN);
    expect(store.getFeatureState("pagination").pageIndex).toBe(0);
    store.pagination.setPage(2.7);
    expect(store.getFeatureState("pagination").pageIndex).toBe(2);
    store.pagination.setPage((prev) => prev + 1);
    expect(store.getFeatureState("pagination").pageIndex).toBe(3);
  });

  it("keeps the state object when a write changes nothing", () => {
    const store = createTableStore(clientTable());
    const before = store.getFeatureState("pagination");
    store.pagination.setPage(0);
    store.pagination.setPageSize(10);
    expect(store.getFeatureState("pagination")).toBe(before);
  });

  it("sets the page size and goes back to page 0 in one write", () => {
    const store = createTableStore(clientTable({ sizes: [2, 4] }));
    store.pagination.setPage(1);
    const listener = vi.fn<() => void>();
    store.subscribeFeature("pagination", listener);
    store.pagination.setPageSize((prev) => prev * 2);
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 0, pageSize: 4 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps page sizes at 1 or more", () => {
    const store = createTableStore(clientTable());
    store.pagination.setPageSize(0);
    expect(store.getFeatureState("pagination").pageSize).toBe(1);
    store.pagination.setPageSize(5.9);
    expect(store.getFeatureState("pagination").pageSize).toBe(5);
    store.pagination.setPageSize(Number.NaN);
    expect(store.getFeatureState("pagination").pageSize).toBe(5);
  });

  it("fixes an invalid starting state", () => {
    const store = createTableStore(clientTable(undefined, { pageIndex: -1.5, pageSize: 0 }));
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 0, pageSize: 1 });
  });

  it("exposes the sizes and mode", () => {
    const store = createTableStore(clientTable());
    expect(store.pagination.sizes).toEqual([10, 25, 50, 100]);
    expect(store.pagination.mode).toBe("offset");
    const custom = createTableStore(clientTable({ sizes: [5, 15], mode: "cursor" }));
    expect(custom.pagination.sizes).toEqual([5, 15]);
    expect(custom.pagination.mode).toBe("cursor");
  });

  it("resets to the starting state", () => {
    const store = createTableStore(clientTable({ sizes: [2] }, { pageIndex: 1, pageSize: 3 }));
    store.pagination.setPageSize(7);
    store.pagination.setPage(4);
    store.pagination.reset();
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 1, pageSize: 3 });
  });

  it("adds nothing to the server request", () => {
    const store = createTableStore(clientTable());
    expect(store.getRequest()).not.toHaveProperty("pagination");
    expect(store.getRequestKey()).not.toContain("pagination");
  });
});

describe("pagination with detail rows", () => {
  it("keeps a row's detail rows on its page without taking slots", () => {
    const first = createTableStore(detailTable(2, { b: 2 })).computeRows(users, { pageSize: 2 });
    expect(ids(first)).toEqual(["a", "b", "b:detail1", "b:detail2"]);
    expect(first).toMatchObject({ matchingCount: 4, totalCount: 4, pageCount: 2 });
    const second = createTableStore(detailTable(2, { b: 2 }, 1)).computeRows(users, { pageSize: 2 });
    expect(ids(second)).toEqual(["c", "d"]);
  });

  it("keeps detail rows with the row at the end of a page and the last row", () => {
    const store = createTableStore(detailTable(3, { c: 1, d: 1 }));
    expect(ids(store.computeRows(users))).toEqual(["a", "b", "c", "c:detail1"]);
    store.pagination.setPage(1);
    expect(ids(store.computeRows(users))).toEqual(["d", "d:detail1"]);
    store.pagination.setPage(2);
    expect(store.computeRows(users).rows).toEqual([]);
  });

  it("counts the same matching rows and pages whether rows are expanded or not", () => {
    const collapsed = createTableStore(detailTable(3, {}));
    const expanded = createTableStore(detailTable(3, { a: 1, b: 2, c: 3, d: 4 }));
    const view = expanded.computeRows(users, { pageSize: 3 });
    expect(ids(view)).toEqual(["a", "a:detail1", "b", "b:detail1", "b:detail2", "c", "c:detail1", "c:detail2", "c:detail3"]);
    expect(view).toMatchObject({ matchingCount: 4, totalCount: 4, pageCount: 2 });
    expect(collapsed.computeRows(users, { pageSize: 3 })).toMatchObject({ matchingCount: 4, totalCount: 4, pageCount: 2 });
    expect(computePaginationMeta(expanded.getFeatureState("pagination"), view.totalCount).pageCount).toBe(2);
  });

  it("counts child data rows as rows and keeps detail rows above the first row on the first page", () => {
    const def = defineTable<User>()({
      getRowId: (row) => row.id,
      columns,
      features: [tree(), pagination({ sizes: [2] })],
    });
    const store = createTableStore(def);
    const first = store.computeRows(users, { pageSize: 2 });
    expect(ids(first)).toEqual(["orphan", "a", "a.1", "a.1:detail1"]);
    expect(first).toMatchObject({ matchingCount: 6, totalCount: 6, pageCount: 3 });
    store.pagination.setPage(1);
    expect(ids(store.computeRows(users))).toEqual(["a.2", "b"]);
    store.pagination.setPage(2);
    expect(ids(store.computeRows(users))).toEqual(["c", "d"]);
  });
});

describe("rows effect", () => {
  it("goes back to page 0 in the same patch as a write that changes the matching rows", () => {
    let value = { filtering: { query: "" }, pagination: { pageIndex: 0, pageSize: 2 } as PaginationState };
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
    const store = createTableStore(clientTable({ sizes: [2] }), { bind: { filtering: group, pagination: group } });
    store.pagination.setPage(1);
    group.set.mockClear();

    store.filtering.setQuery("a");
    expect(group.set).toHaveBeenCalledTimes(1);
    expect(group.set).toHaveBeenCalledWith({ filtering: { query: "a" }, pagination: { pageIndex: 0, pageSize: 2 } });
  });

  it("stays on the page for view and none writes", () => {
    const store = createTableStore(clientTable());
    store.pagination.setPage(2);
    store.sorting.sortBy("name");
    expect(store.getFeatureState("pagination").pageIndex).toBe(2);
    store.filtering.setQuietly("b");
    expect(store.getFeatureState("pagination").pageIndex).toBe(2);
  });

  it("keeps the state object when already on page 0", () => {
    const store = createTableStore(clientTable());
    const before = store.getFeatureState("pagination");
    store.filtering.setQuery("a");
    expect(store.getFeatureState("pagination")).toBe(before);
  });
});

describe("cursor mode", () => {
  it("sets the cursor and clears it when the matching rows change", () => {
    const store = createTableStore(serverTable({ mode: "cursor" }));
    store.pagination.setCursor("abc");
    store.pagination.setPage(1);
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 1, pageSize: 10, cursor: "abc" });
    store.filtering.setQuery("a");
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 0, pageSize: 10, cursor: null });
  });

  it("clears the cursor when the page size changes", () => {
    const store = createTableStore(serverTable({ mode: "cursor" }));
    store.pagination.setCursor("abc");
    store.pagination.setPageSize(25);
    expect(store.getFeatureState("pagination")).toEqual({ pageIndex: 0, pageSize: 25, cursor: null });
  });

  it("puts the cursor in the request once the state has one", () => {
    const store = createTableStore(serverTable({ mode: "cursor" }));
    expect(store.getRequest().pagination).toEqual({ pageIndex: 0, pageSize: 10 });
    store.pagination.setCursor("abc");
    expect(store.getRequest().pagination).toEqual({ pageIndex: 0, pageSize: 10, cursor: "abc" });
  });
});

describe("remotePagination", () => {
  it("puts the page in the request and the request key", () => {
    const store = createTableStore(serverTable({ sizes: [25, 50] }));
    expect(store.getRequest().pagination).toEqual({ pageIndex: 0, pageSize: 25 });
    const key = store.getRequestKey();
    expect(key).toContain('"pagination":{"pageIndex":0,"pageSize":25}');
    store.pagination.setPage(2);
    expect(store.getRequest().pagination).toEqual({ pageIndex: 2, pageSize: 25 });
    expect(store.getRequestKey()).not.toBe(key);
  });

  it("leaves the rows as the server sent them", () => {
    const store = createTableStore(serverTable({ sizes: [2] }));
    store.pagination.setPage(1);
    const view = store.computeRows(users, { totalCount: 40 });
    expect(ids(view)).toEqual(["a", "b", "c", "d"]);
    expect(view.totalCount).toBe(40);
  });

  it("goes back to page 0 when the matching rows change", () => {
    const store = createTableStore(serverTable());
    store.pagination.setPage(3);
    store.filtering.setQuery("x");
    expect(store.getRequest().pagination).toEqual({ pageIndex: 0, pageSize: 10 });
  });
});

const page = (pageIndex: number, pageSize = 10): PaginationState => ({ pageIndex, pageSize });

describe("computePaginationMeta", () => {
  it("has no pages when nothing matches", () => {
    expect(computePaginationMeta(page(0), 0)).toEqual({
      pageIndex: 0,
      pageSize: 10,
      pageCount: 0,
      totalCount: 0,
      canPrev: false,
      canNext: false,
      sizes: [10, 25, 50, 100],
      cursor: undefined,
    });
    const stranded = computePaginationMeta(page(2), 0);
    expect(stranded.canPrev).toBe(true);
    expect(stranded.canNext).toBe(false);
  });

  it("counts an exact multiple without an extra page", () => {
    const meta = computePaginationMeta(page(0), 30);
    expect(meta.pageCount).toBe(3);
    expect(meta.canPrev).toBe(false);
    expect(meta.canNext).toBe(true);
    expect(computePaginationMeta(page(2), 30).canNext).toBe(false);
  });

  it("counts a partial last page", () => {
    const meta = computePaginationMeta(page(1), 31);
    expect(meta.pageCount).toBe(4);
    expect(meta.canPrev).toBe(true);
    expect(meta.canNext).toBe(true);
    expect(computePaginationMeta(page(3), 31).canNext).toBe(false);
  });

  it("passes the sizes and cursor through", () => {
    const meta = computePaginationMeta({ pageIndex: 0, pageSize: 5, cursor: "abc" }, 12, [5, 15]);
    expect(meta.sizes).toEqual([5, 15]);
    expect(meta.cursor).toBe("abc");
  });
});
