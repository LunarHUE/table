import { describe, expect, it, vi } from "vitest";
import { bindGroup, type ControlledGroupBinding, type ExternalGroupBinding } from "./bindings.js";
import { defineTable } from "./define-table.js";
import { filtering, remoteFiltering } from "./features/filtering.js";
import { pagination, remotePagination } from "./features/pagination.js";
import { selection } from "./features/selection.js";
import { remoteSorting, sorting } from "./features/sorting.js";
import { visibility } from "./features/visibility.js";
import { defineStateAdapter, resolveTableState } from "./state-adapter.js";
import { createTableStore } from "./store.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "admin" | "member";
}

interface UsersFilters {
  readonly q: string;
  readonly role: "all" | "admin" | "member";
}

const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [
    col.key("name", { label: "Name", sortable: true }),
    col.key("email", { label: "Email", sortable: true }),
    col.key("role", { label: "Role", sortable: true }),
    col.key("id", { label: "ID" }),
  ],
  features: [
    remoteSorting(),
    remoteFiltering<UsersFilters>({ initial: { q: "", role: "all" } }),
    remotePagination({ sizes: [20, 50, 100] }),
    selection(),
    visibility(),
  ],
});

const ordersTable = defineTable<{ readonly id: string; readonly total: number }>()({
  getRowId: (o) => o.id,
  columns: (col) => [col.key("total", { label: "Total", sortable: true })],
  features: [sorting(), pagination({ sizes: [10, 25] })],
});

type RawSearch = Readonly<Record<string, string | readonly string[] | undefined>>;
interface FilterParser {
  parse(input: RawSearch): Readonly<Record<string, unknown>>;
}

const first = (v: string | readonly string[] | undefined): string => (typeof v === "string" ? v : (v?.[0] ?? ""));

const appTableUrl = defineStateAdapter({
  features: ["sorting", "pagination", "filtering"] as const,
  parse(raw: RawSearch, filterSchema?: FilterParser) {
    const sortStr = first(raw.sort);
    const pageNum = Number(first(raw.page));
    const sizeNum = Number(first(raw.size));
    return {
      sorting: sortStr
        .split(",")
        .filter(Boolean)
        .map((part) => {
          const [id, dir] = part.split(".");
          return { id: id ?? "", desc: dir === "desc" };
        }),
      pagination: {
        pageIndex: Number.isFinite(pageNum) && pageNum >= 1 ? Math.trunc(pageNum) - 1 : 0,
        ...(Number.isFinite(sizeNum) && sizeNum >= 1 ? { pageSize: Math.trunc(sizeNum) } : {}),
      },
      ...(filterSchema ? { filtering: filterSchema.parse(raw) } : {}),
    };
  },
  serialize(state, defaults) {
    const out: Record<string, string> = {};
    if (state.sorting?.length) {
      out.sort = state.sorting.map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`).join(",");
    }
    if (state.pagination && state.pagination.pageIndex > 0) {
      out.page = String(state.pagination.pageIndex + 1);
    }
    if (state.pagination && state.pagination.pageSize !== defaults.pagination?.pageSize) {
      out.size = String(state.pagination.pageSize);
    }
    if (state.filtering) {
      for (const [k, v] of Object.entries(state.filtering)) {
        if (typeof v === "string" && v !== "" && v !== defaults.filtering?.[k]) {
          out[k] = v;
        }
      }
    }
    return out;
  },
});

const usersFilterParser: FilterParser = {
  parse(raw) {
    const role = first(raw.role);
    return {
      q: first(raw.q),
      role: role === "admin" || role === "member" ? role : "all",
    };
  },
};

describe("bindGroup", () => {
  it("shares one ControlledGroupBinding instance across every listed feature", () => {
    const onStateChange = vi.fn<(updater: (prev: { sorting: readonly []; pagination: { pageIndex: number; pageSize: number } }) => { sorting: readonly []; pagination: { pageIndex: number; pageSize: number } }) => void>();
    const state = { sorting: [] as const, pagination: { pageIndex: 0, pageSize: 20 } };
    const bound = bindGroup(["sorting", "pagination"] as const, { state, onStateChange });

    expect(bound.sorting).toBe(bound.pagination);
    expect(bound.sorting.kind).toBe("controlled-group");
    const group: ControlledGroupBinding<typeof state> = bound.sorting;
    expect(group.state).toBe(state);
  });

  it("shares one ExternalGroupBinding instance and dispatches atomic multi-feature patches once", () => {
    let current = {
      filtering: { q: "", role: "all" as const },
      pagination: { pageIndex: 3, pageSize: 20 },
    };
    const set = vi.fn<(next: typeof current) => void>((next) => {
      current = next;
    });
    const listeners = new Set<() => void>();
    const bound = bindGroup(["filtering", "pagination"] as const, {
      get: () => current,
      set,
      subscribe: (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    });

    expect(bound.filtering).toBe(bound.pagination);
    const group: ExternalGroupBinding<typeof current> = bound.filtering;
    expect(group.kind).toBe("group");

    const store = createTableStore(usersTable, { bind: bound });
    store.filtering.set("q", "ada");

    expect(set).toHaveBeenCalledTimes(1);
    expect(current).toEqual({
      filtering: { q: "ada", role: "all" },
      pagination: { pageIndex: 0, pageSize: 20 },
    });
  });
});

describe("resolveTableState", () => {
  it("matches a fresh store's defaults, request and requestKey when called with no overrides", () => {
    const resolved = resolveTableState(usersTable);
    const store = createTableStore(usersTable);

    expect(resolved.state).toEqual(store.getState());
    expect(resolved.request).toEqual(store.getRequest());
    expect(resolved.requestKey).toBe(store.getRequestKey());
  });

  it("normalizes unknown or unsortable column ids, merges partial pagination/filtering, and switches selection mode cleanly", () => {
    const resolved = resolveTableState(usersTable, {
      sorting: [
        { id: "name", desc: true },
        { id: "id", desc: false }, // unsortable
        { id: "deleted_col", desc: false }, // unknown
      ],
      pagination: { pageIndex: 2 }, // pageSize omitted -> inherits 20 from tableDef
      filtering: { q: "ada" }, // role omitted -> inherits "all"
      selection: { mode: "all", except: ["u1"] },
      visibility: { hidden: ["email", "ghost_col"] },
    });

    expect(resolved.state.sorting).toEqual([{ id: "name", desc: true }]);
    expect(resolved.state.pagination).toEqual({ pageIndex: 2, pageSize: 20 });
    expect(resolved.state.filtering).toEqual({ q: "ada", role: "all" });
    expect(resolved.state.selection).toEqual({ mode: "all", except: ["u1"] });
    expect(resolved.state.visibility).toEqual({ hidden: ["email"] });
    expect(resolved.request).toEqual({
      sorting: [{ id: "name", desc: true }],
      filtering: { q: "ada", role: "all" },
      pagination: { pageIndex: 2, pageSize: 20 },
    });
  });

  it("produces the exact same requestKey as a store initialized with matching bound state", () => {
    const resolved = resolveTableState(usersTable, {
      sorting: [{ id: "email", desc: false }],
      filtering: { q: "grace", role: "admin" },
      pagination: { pageIndex: 1, pageSize: 50 },
    });
    const store = createTableStore(usersTable, {
      bind: bindGroup(["sorting", "filtering", "pagination"] as const, {
        state: {
          sorting: resolved.state.sorting,
          filtering: resolved.state.filtering,
          pagination: resolved.state.pagination,
        },
        onStateChange: () => {},
      }),
    });

    expect(resolved.request).toEqual(store.getRequest());
    expect(resolved.requestKey).toBe(store.getRequestKey());
  });
});

describe("defineStateAdapter", () => {
  it("reuses one shared adapter across tables with different feature subsets", () => {
    const users = appTableUrl.resolve(
      usersTable,
      { sort: "name.desc,bogus.asc", page: "2", size: "50", q: "ada", role: "admin" },
      usersFilterParser,
    );
    expect(users.state.sorting).toEqual([{ id: "name", desc: true }]);
    expect(users.state.pagination).toEqual({ pageIndex: 1, pageSize: 50 });
    expect(users.state.filtering).toEqual({ q: "ada", role: "admin" });
    expect(users.state.selection).toEqual({ mode: "ids", ids: [] });

    // Orders table has no `filtering` feature — same shared adapter works cleanly
    const orders = appTableUrl.resolve(ordersTable, { sort: "total.asc", page: "3" });
    expect(orders.state.sorting).toEqual([{ id: "total", desc: false }]);
    expect(orders.state.pagination).toEqual({ pageIndex: 2, pageSize: 10 });
    expect(orders.request).toEqual({});
  });

  it("serializes state cleanly while omitting defaults", () => {
    const defaults = resolveTableState(usersTable).state;
    expect(appTableUrl.serialize(defaults, defaults)).toEqual({});

    const out = appTableUrl.serialize(
      {
        sorting: [{ id: "name", desc: true }],
        pagination: { pageIndex: 1, pageSize: 50 },
        filtering: { q: "ada", role: "all" },
      },
      defaults,
    );
    expect(out).toEqual({ sort: "name.desc", page: "2", size: "50", q: "ada" });
  });

  it("ignores keys returned by parse that are not declared in adapter.features", () => {
    const onlySort = defineStateAdapter({
      features: ["sorting"] as const,
      parse(raw: RawSearch) {
        return {
          sorting: [{ id: first(raw.sort), desc: false }],
          // Stray key not in `features` must not override pagination
          pagination: { pageIndex: 99, pageSize: 99 },
        } as { sorting: { id: string; desc: boolean }[] };
      },
      serialize: (state) => state.sorting ?? [],
    });

    const resolved = onlySort.resolve(usersTable, { sort: "name" });
    expect(resolved.state.sorting).toEqual([{ id: "name", desc: false }]);
    expect(resolved.state.pagination).toEqual({ pageIndex: 0, pageSize: 20 });
  });

  it("works with client-only filtering tables too", () => {
    const clientTable = defineTable<User>()({
      getRowId: (u) => u.id,
      columns: (col) => [col.key("name", { sortable: true })],
      features: [
        sorting(),
        filtering({ initial: { q: "" }, rows: (u: User, f) => !f.q || u.name.includes(f.q) }),
      ],
    });
    const resolved = appTableUrl.resolve(clientTable, { sort: "name.desc", q: "ada" }, { parse: (r) => ({ q: first(r.q) }) });
    expect(resolved.state.sorting).toEqual([{ id: "name", desc: true }]);
    expect(resolved.state.filtering).toEqual({ q: "ada" });
  });
});
