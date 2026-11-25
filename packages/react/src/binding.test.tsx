import {
  defineStateAdapter,
  defineTable,
  pagination,
  remoteFiltering,
  remotePagination,
  remoteSorting,
  selection,
  sorting,
  visibility,
  type ExternalBinding,
  type StateOf,
} from "@lunarhue/table-core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState, useTransition } from "react";
import { describe, expect, it, vi } from "vitest";
import { useTableBinding } from "./binding.js";
import { Cell, Header } from "./cell.js";
import type { HeaderApi } from "./define-cell.js";
import { useColumnState, useFeatureState, useHeaderGroups, useTable, useTableRequest, useTableRows, useVisibleColumns } from "./hooks.js";
import { usePagination } from "./view-hooks.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
}

interface UsersFilters {
  readonly q: string;
  readonly role: "all" | "admin" | "member";
}

function SortHeader({ header }: { readonly header: HeaderApi<User> }) {
  const dir = useColumnState(header.table, header.header.id, "sorting");
  return (
    <span>
      {header.header.label}:{typeof dir === "string" ? dir : "none"}
    </span>
  );
}

const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [
    col.key("name", { label: "Name", sortable: true, header: SortHeader }),
    col.key("role", { label: "Role", sortable: true, header: SortHeader }),
  ],
  features: [
    remoteSorting(),
    remoteFiltering<UsersFilters>({ initial: { q: "", role: "all" } }),
    remotePagination({ sizes: [10, 25] }),
    selection(),
    visibility(),
  ],
});

const ordersTable = defineTable<{ readonly id: string; readonly total: number }>()({
  getRowId: (o) => o.id,
  columns: (col) => [col.key("total", { label: "Total", sortable: true })],
  features: [sorting(), pagination({ sizes: [5, 10] })],
});

type RawSearch = Readonly<Record<string, string | undefined>>;
interface FilterParser {
  parse(input: RawSearch): Readonly<Record<string, unknown>>;
}

const appTableUrl = defineStateAdapter({
  features: ["sorting", "pagination", "filtering"] as const,
  parse(raw: RawSearch, filters?: FilterParser) {
    const sort = raw.sort ?? "";
    const page = Number(raw.page ?? "1");
    const size = raw.size ? Number(raw.size) : undefined;
    return {
      sorting: sort
        .split(",")
        .filter(Boolean)
        .map((part) => {
          const [id, dir] = part.split(".");
          return { id: id ?? "", desc: dir === "desc" };
        }),
      pagination: {
        pageIndex: Number.isFinite(page) && page >= 1 ? Math.trunc(page) - 1 : 0,
        ...(size !== undefined && Number.isFinite(size) ? { pageSize: Math.trunc(size) } : {}),
      },
      ...(filters ? { filtering: filters.parse(raw) } : {}),
    };
  },
  serialize(state, defaults) {
    const sp = new URLSearchParams();
    if (state.sorting?.length) {
      sp.set("sort", state.sorting.map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`).join(","));
    }
    if (state.pagination && state.pagination.pageIndex > 0) {
      sp.set("page", String(state.pagination.pageIndex + 1));
    }
    if (state.pagination && state.pagination.pageSize !== defaults.pagination?.pageSize) {
      sp.set("size", String(state.pagination.pageSize));
    }
    if (state.filtering) {
      for (const [k, v] of Object.entries(state.filtering)) {
        if (typeof v === "string" && v !== "" && v !== defaults.filtering?.[k]) {
          sp.set(k, v);
        }
      }
    }
    return sp;
  },
});

const usersFilters: FilterParser = {
  parse(raw) {
    const role = raw.role;
    return {
      q: raw.q ?? "",
      role: role === "admin" || role === "member" ? role : "all",
    };
  },
};

const sampleUsers: readonly User[] = [
  { id: "1", name: "Ada", role: "admin" },
  { id: "2", name: "Grace", role: "member" },
];

function Pager({
  table,
  onCommit,
}: {
  readonly table: ReturnType<typeof useTable<typeof usersTable>>;
  readonly onCommit: () => void;
}) {
  const pager = usePagination(table, { totalCount: 30 });
  useEffect(() => {
    onCommit();
  });
  return <span data-testid="pager">{pager.pageIndex}</span>;
}

function StabilityApp({ onCommit }: { readonly onCommit: () => void }) {
  const [tick, setTick] = useState(0);
  // Start on page 1 (pageIndex 0) so sorting's matching rowsEffect leaves pagination equal
  const [search, setSearch] = useState<RawSearch>({ page: "1" });
  const { bind } = useTableBinding(usersTable, appTableUrl, {
    input: { ...search },
    extra: usersFilters,
    onWrite(sp) {
      setSearch(Object.fromEntries(sp));
    },
  });
  const table = useTable(usersTable, { bind });
  return (
    <div>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        unrelated:{tick}
      </button>
      <button type="button" onClick={() => table.sorting.toggle("name")}>
        sort
      </button>
      <Pager table={table} onCommit={onCommit} />
    </div>
  );
}

describe("useTableBinding", () => {
  it("hydrates from searchParams matching appTableUrl.resolve and sends atomic filter + page reset in one onWrite", () => {
    const writes: string[] = [];

    function App() {
      const [search, setSearch] = useState<RawSearch>({ page: "3", sort: "name.desc", q: "" });
      // Intentionally pass a fresh object on every render to verify reference stabilization
      const { bind } = useTableBinding(usersTable, appTableUrl, {
        input: { ...search },
        extra: usersFilters,
        onWrite(sp) {
          writes.push(sp.toString());
          setSearch(Object.fromEntries(sp));
        },
      });
      const table = useTable(usersTable, { bind });
      const request = useTableRequest(table);
      const filters = useFeatureState(table, "filtering");
      const view = useTableRows(table, sampleUsers, { totalCount: 50 });
      const visibleColumns = useVisibleColumns(table);
      const pager = usePagination(table, view);
      const groups = useHeaderGroups(table);

      return (
        <div>
          <input
            aria-label="search"
            value={filters.q}
            onChange={(e) => table.filtering.set("q", e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              table.filtering.set("q", "grace");
              table.sorting.toggle("role");
            }}
          >
            multi
          </button>
          <span data-testid="page">{pager.pageIndex + 1}</span>
          <span data-testid="req">{JSON.stringify(request)}</span>
          <table>
            <thead>
              {groups.map((g) => (
                <tr key={g.id}>
                  {g.headers.map((h) => (
                    <th key={h.id}>
                      <Header table={table} header={h} rows={view.rows} />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.id}>
                  {visibleColumns.map((c) => (
                    <td key={c.id}>
                      <Cell table={table} row={r} column={c} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    const serverResolved = appTableUrl.resolve(usersTable, { page: "3", sort: "name.desc", q: "" }, usersFilters);
    render(<App />);

    // Initial client request matches server-side `appTableUrl.resolve`
    expect(JSON.parse(screen.getByTestId("req").textContent ?? "")).toEqual(serverResolved.request);
    expect(screen.getByTestId("page").textContent).toBe("3");

    // Changing filter resets pageIndex from 2 -> 0 in ONE atomic onWrite call
    fireEvent.change(screen.getByLabelText("search"), { target: { value: "ada" } });
    expect(writes).toEqual(["sort=name.desc&q=ada"]);
    expect(screen.getByTestId("page").textContent).toBe("1");

    // Multiple commands in one event handler compose cleanly
    fireEvent.click(screen.getByText("multi"));
    expect(writes[writes.length - 1]).toBe("sort=role.asc&q=grace");
  });

  it("does not re-render unaffected hooks when a fresh input object has unchanged values", () => {
    const onPagerCommit = vi.fn<() => void>();

    render(<StabilityApp onCommit={onPagerCommit} />);
    const baseline = onPagerCommit.mock.calls.length;

    // Unrelated parent re-render with fresh `input` object must not wake Pager
    fireEvent.click(screen.getByText("unrelated:0"));
    expect(onPagerCommit.mock.calls.length).toBe(baseline);

    // Sorting change leaves pagination value equal -> Pager keeps its reference and does not wake
    fireEvent.click(screen.getByText("sort"));
    expect(onPagerCommit.mock.calls.length).toBe(baseline);
  });

  it("applies optimistic state immediately during an async transition and reverts if rejected", async () => {
    let finishNav: (() => void) | undefined;
    const onWrite = vi.fn<(qs: string) => void>();

    function App({ reject }: { readonly reject: boolean }) {
      const [search, setSearch] = useState<RawSearch>({ q: "" });
      const [, startOuter] = useTransition();
      const { bind, isPending } = useTableBinding(usersTable, appTableUrl, {
        input: search,
        extra: usersFilters,
        onWrite(sp) {
          onWrite(sp.toString());
          startOuter(async () => {
            await new Promise<void>((resolve) => {
              finishNav = resolve;
            });
            if (!reject) setSearch(Object.fromEntries(sp));
          });
        },
      });
      const table = useTable(usersTable, { bind });
      const filters = useFeatureState(table, "filtering");
      return (
        <div>
          <input aria-label="q" value={filters.q} onChange={(e) => table.filtering.set("q", e.target.value)} />
          <span data-testid="pending">{String(isPending)}</span>
        </div>
      );
    }

    const { rerender } = render(<App reject={false} />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "ada" } });
    // Optimistic input updates immediately before navigation finishes
    expect(screen.getByLabelText<HTMLInputElement>("q").value).toBe("ada");
    expect(onWrite).toHaveBeenCalledWith("q=ada");

    await act(async () => {
      finishNav?.();
    });
    expect(screen.getByLabelText<HTMLInputElement>("q").value).toBe("ada");

    // Rejected transition reverts optimistic state when the transition finishes
    rerender(<App reject={true} />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "nope" } });
    expect(screen.getByLabelText<HTMLInputElement>("q").value).toBe("nope");
    await act(async () => {
      finishNav?.();
    });
    expect(screen.getByLabelText<HTMLInputElement>("q").value).toBe("ada");
  });

  it("clears an all-matching selection when the back button or a link changes the URL, with no onWrite", () => {
    const onWrite = vi.fn<(qs: string) => void>();

    function App() {
      // A history stack: the table pushes entries, and back pops one without the table.
      const [entries, setEntries] = useState<readonly RawSearch[]>([{ q: "" }]);
      const search = entries[entries.length - 1] ?? {};
      const { bind } = useTableBinding(usersTable, appTableUrl, {
        input: search,
        extra: usersFilters,
        transition: false,
        onWrite(sp) {
          onWrite(sp.toString());
          setEntries((prev) => [...prev, Object.fromEntries(sp)]);
        },
      });
      const table = useTable(usersTable, { bind });
      const filters = useFeatureState(table, "filtering");
      const picked = useFeatureState(table, "selection");
      const page = useFeatureState(table, "pagination");
      return (
        <div>
          <input aria-label="q" value={filters.q} onChange={(e) => table.filtering.set("q", e.target.value)} />
          <button type="button" onClick={() => table.selection.selectAllMatching()}>
            select all
          </button>
          <button type="button" onClick={() => setEntries((prev) => prev.slice(0, -1))}>
            back
          </button>
          <button type="button" onClick={() => setEntries((prev) => [...prev, { q: "grace", page: "3" }])}>
            grace link
          </button>
          <span data-testid="selection">{picked.mode}</span>
          <span data-testid="page">{page.pageIndex + 1}</span>
        </div>
      );
    }

    render(<App />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "ada" } });
    expect(onWrite).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("select all"));
    expect(screen.getByTestId("selection").textContent).toBe("all");

    fireEvent.click(screen.getByText("back"));
    expect(screen.getByLabelText<HTMLInputElement>("q").value).toBe("");
    expect(screen.getByTestId("selection").textContent).toBe("ids");

    fireEvent.click(screen.getByText("select all"));
    fireEvent.click(screen.getByText("grace link"));
    expect(screen.getByTestId("selection").textContent).toBe("ids");
    // The link chose its page, and the table sent the URL nothing.
    expect(screen.getByTestId("page").textContent).toBe("3");
    expect(onWrite).toHaveBeenCalledTimes(1);
  });

  it("keeps a selection made while the table's own navigation is pending", async () => {
    let finishNav: (() => void) | undefined;

    function App() {
      const [search, setSearch] = useState<RawSearch>({ q: "" });
      const [, startOuter] = useTransition();
      const { bind } = useTableBinding(usersTable, appTableUrl, {
        input: search,
        extra: usersFilters,
        onWrite(sp) {
          startOuter(async () => {
            await new Promise<void>((resolve) => {
              finishNav = resolve;
            });
            setSearch(Object.fromEntries(sp));
          });
        },
      });
      const table = useTable(usersTable, { bind });
      const picked = useFeatureState(table, "selection");
      return (
        <div>
          <input aria-label="q" onChange={(e) => table.filtering.set("q", e.target.value)} />
          <button type="button" onClick={() => table.selection.selectAllMatching()}>
            select all
          </button>
          <span data-testid="selection">{picked.mode}</span>
        </div>
      );
    }

    render(<App />);
    fireEvent.change(screen.getByLabelText("q"), { target: { value: "ada" } });
    fireEvent.click(screen.getByText("select all"));
    expect(screen.getByTestId("selection").textContent).toBe("all");
    // The URL catches up with the filter the table already shows: same rows, same selection.
    await act(async () => {
      finishNav?.();
    });
    expect(screen.getByTestId("selection").textContent).toBe("all");
  });

  it("intersects adapter features with tableDef and composes with other feature owners", () => {
    let hidden: readonly ("name" | "role")[] = [];
    const visListeners = new Set<() => void>();
    const visBinding: ExternalBinding<StateOf<typeof usersTable>["visibility"]> = {
      get: () => ({ hidden }),
      set: (next) => {
        hidden = next.hidden;
        visListeners.forEach((l) => l());
      },
      subscribe: (l) => {
        visListeners.add(l);
        return () => visListeners.delete(l);
      },
    };

    const orderWrites: string[] = [];

    function BothTables() {
      const [orderSearch, setOrderSearch] = useState<RawSearch>({ sort: "total.desc", page: "2" });
      const { bind: orderBind } = useTableBinding(ordersTable, appTableUrl, {
        input: orderSearch,
        transition: false,
        onWrite(sp) {
          orderWrites.push(sp.toString());
          setOrderSearch(Object.fromEntries(sp));
        },
      });
      const orders = useTable(ordersTable, { bind: orderBind });
      const ordersSort = useFeatureState(orders, "sorting");
      const ordersPage = useFeatureState(orders, "pagination");

      const { bind: userBind } = useTableBinding(usersTable, appTableUrl, {
        input: {},
        extra: usersFilters,
        transition: false,
        onWrite: () => {},
      });
      const users = useTable(usersTable, { bind: { ...userBind, visibility: visBinding } });
      const userVis = useFeatureState(users, "visibility");

      return (
        <div>
          <span data-testid="orders">{`${ordersSort[0]?.id}:${ordersSort[0]?.desc}:${ordersPage.pageIndex}`}</span>
          <button type="button" onClick={() => orders.pagination.setPage(0)}>
            first
          </button>
          <span data-testid="vis">{userVis.hidden.join(",")}</span>
          <button type="button" onClick={() => users.visibility.toggle("role")}>
            hide-role
          </button>
        </div>
      );
    }

    render(<BothTables />);
    expect(screen.getByTestId("orders").textContent).toBe("total:true:1");
    fireEvent.click(screen.getByText("first"));
    expect(orderWrites).toEqual(["sort=total.desc"]);

    fireEvent.click(screen.getByText("hide-role"));
    expect(screen.getByTestId("vis").textContent).toBe("role");
  });
});
