import { createRoot, createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import { createTableBinding } from "./binding.js";
import {
  createFeatureState,
  createTable,
  createTableRequest,
  defineStateAdapter,
  defineTable,
  pagination,
  remoteFiltering,
  remotePagination,
  remoteSorting,
  sorting,
} from "./index.js";

interface User {
  readonly id: string;
  readonly name: string;
}

const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [col.key("name", { sortable: true })],
  features: [
    remoteSorting(),
    remoteFiltering({ initial: { q: "" } }),
    remotePagination({ sizes: [10, 25] }),
  ],
});

const ordersTable = defineTable<{ readonly id: string; readonly total: number }>()({
  getRowId: (o) => o.id,
  columns: (col) => [col.key("total", { sortable: true })],
  features: [sorting(), pagination({ sizes: [5, 10] })],
});

const appUrl = defineStateAdapter({
  features: ["sorting", "pagination", "filtering"] as const,
  parse(raw: Readonly<Record<string, string | undefined>>) {
    const sort = raw.sort ?? "";
    const page = Number(raw.page ?? "1");
    return {
      sorting: sort
        .split(",")
        .filter(Boolean)
        .map((part) => {
          const [id, dir] = part.split(".");
          return { id: id ?? "", desc: dir === "desc" };
        }),
      pagination: { pageIndex: Number.isFinite(page) && page >= 1 ? Math.trunc(page) - 1 : 0 },
      filtering: { q: raw.q ?? "" },
    };
  },
  serialize(state) {
    const sp = new URLSearchParams();
    if (state.sorting?.length) sp.set("sort", state.sorting.map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`).join(","));
    if (state.pagination && state.pagination.pageIndex > 0) sp.set("page", String(state.pagination.pageIndex + 1));
    const q = state.filtering?.q;
    if (typeof q === "string" && q) sp.set("q", q);
    return sp;
  },
});

describe("createTableBinding", () => {
  it("syncs reactively with a signal source and emits atomic filter + page reset writes", () => {
    createRoot((dispose) => {
      const writes: string[] = [];
      const [search, setSearch] = createSignal<Readonly<Record<string, string | undefined>>>({
        page: "3",
        sort: "name.desc",
      });

      const { bind, state } = createTableBinding(usersTable, appUrl, {
        input: search,
        onWrite(sp) {
          writes.push(sp.toString());
          setSearch(Object.fromEntries(sp));
        },
      });

      const table = createTable(usersTable, () => ({ bind: bind() }));
      const request = createTableRequest(table);
      const filters = createFeatureState(table, "filtering");

      expect(state().pagination.pageIndex).toBe(2);
      expect(request().sorting).toEqual([{ id: "name", desc: true }]);

      table.filtering.set("q", "ada");
      flush();
      expect(writes).toEqual(["sort=name.desc&q=ada"]);
      expect(filters().q).toBe("ada");
      expect(state().pagination.pageIndex).toBe(0);

      // Composes multiple commands in one handler
      table.filtering.set("q", "grace");
      table.sorting.clear();
      flush();
      expect(writes[writes.length - 1]).toBe("q=grace");

      dispose();
    });
  });

  it("works with a table that installs only a subset of the adapter's features", () => {
    createRoot((dispose) => {
      const [search, setSearch] = createSignal<Readonly<Record<string, string | undefined>>>({
        sort: "total.asc",
        page: "2",
      });
      const { bind } = createTableBinding(ordersTable, appUrl, {
        input: search,
        onWrite: (sp) => setSearch(Object.fromEntries(sp)),
      });
      const table = createTable(ordersTable, () => ({ bind: bind() }));
      const sort = createFeatureState(table, "sorting");
      const page = createFeatureState(table, "pagination");

      expect(sort()).toEqual([{ id: "total", desc: false }]);
      expect(page().pageIndex).toBe(1);

      table.pagination.setPage(0);
      flush();
      expect(search()).toEqual({ sort: "total.asc" });

      dispose();
    });
  });
});
