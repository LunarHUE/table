import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  createTableStore,
  defineTable,
  remotePagination,
  remoteSorting,
  sortDir,
  useColumnState,
  useFeatureState,
  useSelectAll,
  useSelection,
  useTable,
  useTableRequest,
  useTableRows,
  type StateOf,
  type TableStore,
} from "./index.js";
import * as server from "./server.js";
import { DataTable } from "./test/data-table.js";
import { counts, pagedTable, since, track, type User, userTable, users } from "./test/fixtures.js";

const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent);

type UserTable = TableStore<typeof userTable>;
type Sorting = StateOf<typeof userTable>["sorting"];
type Selection = StateOf<typeof userTable>["selection"];

interface FilterBoxProps {
  readonly table: UserTable;
}

function FilterBox({ table }: FilterBoxProps) {
  const filters = useFeatureState(table, "filtering");
  return <input aria-label="filter" value={filters.q} onChange={(event) => table.filtering.set("q", event.target.value)} />;
}

function SelectionBar({ table }: FilterBoxProps) {
  const view = useTableRows(table, users);
  const summary = useSelection(table, view);
  const all = useSelectAll(table, view.rows, { scope: "matching" });
  return (
    <p>
      <span>{`${String(summary.count)} selected, ${summary.visibleCount} on page, ${summary.target.kind}`}</span>
      <input type="checkbox" aria-label="select matching" checked={all.checked} onChange={all.toggle} />
    </p>
  );
}

function App() {
  const table = useTable(userTable);
  return (
    <DataTable table={table} data={users}>
      <FilterBox table={table} />
      <SelectionBar table={table} />
      <button type="button" onClick={() => table.sorting.toggle("name")}>
        sort by name
      </button>
    </DataTable>
  );
}

describe("a full table", () => {
  it("renders cells, headers and the pager", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole("columnheader", { name: "Joined" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "initial" })).toBeTruthy();
    expect(names()).toEqual(["Cy", "Ada"]);
    expect(screen.getAllByRole("time").map((cell) => cell.textContent)).toEqual(["2024-03-01", "2024-01-01"]);
    expect(screen.getByText("page 1 of 2, 3 rows")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "next" }));
    expect(names()).toEqual(["Bob"]);
    expect(screen.getByText("page 2 of 2, 3 rows")).toBeTruthy();
    // On the last page, `next` stays put.
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("page 2 of 2, 3 rows")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "prev" }));
    expect(names()).toEqual(["Cy", "Ada"]);
  });

  it("sorts and filters", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "sort by name" }));
    expect(names()).toEqual(["Ada", "Bob"]);
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(names()).toEqual(["Cy"]);

    // A filter change goes back to the first page.
    await user.type(screen.getByRole("textbox", { name: "filter" }), "y");
    expect(names()).toEqual(["Cy"]);
    expect(screen.getByText("page 1 of 1, 1 rows, filtered")).toBeTruthy();
    await user.clear(screen.getByRole("textbox", { name: "filter" }));
    expect(screen.getByText("page 1 of 2, 3 rows")).toBeTruthy();
  });

  it("selects rows with 0-argument handlers on onChange", async () => {
    const user = userEvent.setup();
    render(<App />);
    const page = screen.getByRole("checkbox", { name: "select page" });
    await user.click(screen.getByRole("checkbox", { name: "select 1" }));
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "select 1" }).checked).toBe(true);
    expect(page.dataset["indeterminate"]).toBe("true");
    expect(screen.getByText("1 selected, 1 on page, ids")).toBeTruthy();

    await user.click(page);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "select 2" }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "select page" }).checked).toBe(true);
    expect(screen.getByText("2 selected, 2 on page, ids")).toBeTruthy();
    await user.click(page);
    expect(screen.getByText("0 selected, 0 on page, ids")).toBeTruthy();

    await user.click(screen.getByRole("checkbox", { name: "select matching" }));
    expect(screen.getByText("3 selected, 2 on page, all")).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "select matching" }).checked).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "select matching" }));
    expect(screen.getByText("0 selected, 0 on page, ids")).toBeTruthy();
  });
});

interface SortProbeProps {
  readonly table: UserTable;
  readonly id: string;
}

function SortProbe({ table, id }: SortProbeProps) {
  const dir = useColumnState(table, id, "sorting", (part) => String(part));
  track(`sort:${id}`);
  return <span>{`${id} ${dir}`}</span>;
}

function Probes() {
  const table = useTable(userTable);
  return (
    <>
      <SortProbe table={table} id="name" />
      <SortProbe table={table} id="joined" />
      <button type="button" onClick={() => table.sorting.toggle("name")}>
        sort
      </button>
    </>
  );
}

describe("render isolation", () => {
  it("re-renders only the toggled row's selection cell", async () => {
    const user = userEvent.setup();
    render(<App />);
    const before = counts();
    await user.click(screen.getByRole("checkbox", { name: "select 1" }));
    expect(since(before, "select:1")).toBeGreaterThan(0);
    expect(since(before, "select:2")).toBe(0);
    expect(since(before, "name:1")).toBe(0);
    expect(since(before, "table")).toBe(0);
  });

  it("wakes only the sorted column's subscribers", async () => {
    const user = userEvent.setup();
    render(<Probes />);
    const before = counts();
    await user.click(screen.getByRole("button", { name: "sort" }));
    expect(screen.getByText("name asc")).toBeTruthy();
    expect(screen.getByText("joined false")).toBeTruthy();
    expect(since(before, "sort:name")).toBeGreaterThan(0);
    expect(since(before, "sort:joined")).toBe(0);
  });
});

function Controlled() {
  const [sort, setSort] = useState<Sorting>([]);
  const [selected, setSelected] = useState<Selection>({ mode: "ids", ids: [] });
  const table = useTable(userTable, {
    bind: {
      sorting: { kind: "controlled", state: sort, onStateChange: setSort },
      selection: { kind: "controlled", state: selected, onStateChange: setSelected },
    },
  });
  return (
    <DataTable table={table} data={users}>
      <output>{sort.map((entry) => `${entry.id}:${entry.desc ? "desc" : "asc"}`).join(",")}</output>
      <button
        type="button"
        onClick={() => {
          table.sorting.toggle("name");
          table.sorting.toggle("name");
          table.selection.toggle("1");
          table.selection.toggle("2");
        }}
      >
        twice
      </button>
      <button type="button" onClick={() => setSort([{ id: "joined", desc: false }])}>
        by joined
      </button>
    </DataTable>
  );
}

describe("useTable", () => {
  interface OptionsProps {
    readonly omit: readonly string[] | undefined;
    readonly locale: string;
    readonly seen: UserTable[];
  }

  function WithOptions({ omit, locale, seen }: OptionsProps) {
    const [count, setCount] = useState(0);
    const table = useTable(userTable, omit === undefined ? { meta: { locale } } : { omitColumns: omit, meta: { locale } });
    useEffect(() => {
      seen.push(table);
    });
    return (
      <DataTable table={table} data={users}>
        <button type="button" onClick={() => setCount(count + 1)}>{`bump ${count}`}</button>
        <button type="button" onClick={() => table.selection.toggle("2")}>
          select 2
        </button>
      </DataTable>
    );
  }

  it("returns the same table across state and option updates", async () => {
    const user = userEvent.setup();
    const seen: UserTable[] = [];
    const view = render(<WithOptions omit={undefined} locale="" seen={seen} />);
    await user.click(screen.getByRole("button", { name: "bump 0" }));
    await user.click(screen.getByRole("button", { name: "select 2" }));
    view.rerender(<WithOptions omit={["joined"]} locale="fr" seen={seen} />);
    expect(screen.queryByRole("columnheader", { name: "Joined" })).toBeNull();
    expect(screen.getByText("Ada (fr)")).toBeTruthy();
    // Leaving `omitColumns` out shows the column again.
    view.rerender(<WithOptions omit={undefined} locale="fr" seen={seen} />);
    expect(screen.getByRole("columnheader", { name: "Joined" })).toBeTruthy();
    expect(seen.length).toBeGreaterThan(3);
    expect(new Set(seen).size).toBe(1);
  });

  it("keeps cell objects when meta is a new object with the same values", () => {
    const seen: UserTable[] = [];
    const view = render(<WithOptions omit={undefined} locale="de" seen={seen} />);
    const before = counts();
    view.rerender(<WithOptions omit={undefined} locale="de" seen={seen} />);
    expect(since(before, "name:2")).toBe(0);
    expect(screen.getByText("Ada (de)")).toBeTruthy();
  });


  it("lands every command of one handler on controlled slices", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole("button", { name: "twice" }));
    expect(screen.getByRole("status").textContent).toBe("name:desc");
    expect(names()).toEqual(["Cy", "Bob"]);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "select 1" }).checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: "select page" }).dataset["indeterminate"]).toBe("true");
  });

  it("follows the controlled state the app sets", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(screen.getByRole("button", { name: "by joined" }));
    expect(names()).toEqual(["Ada", "Bob"]);
  });

  it("reads and writes an external slice", async () => {
    const user = userEvent.setup();
    let value: Sorting = [];
    const listeners = new Set<() => void>();
    const external = {
      get: () => value,
      set: (next: Sorting) => {
        value = next;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    function External() {
      const table = useTable(userTable, { bind: { sorting: external } });
      return (
        <DataTable table={table} data={users}>
          <button type="button" onClick={() => table.sorting.toggle("name")}>
            sort
          </button>
        </DataTable>
      );
    }
    render(<External />);
    await user.click(screen.getByRole("button", { name: "sort" }));
    expect(value.map((entry) => entry.id)).toEqual(["name"]);
    expect(names()).toEqual(["Ada", "Bob"]);
    act(() => external.set([]));
    expect(names()).toEqual(["Cy", "Ada"]);
  });
});

function Paged() {
  const table = useTable(pagedTable);
  return <DataTable table={table} data={users} />;
}

describe("a generic table on a table without the features", () => {
  it("calls the feature hooks without them", async () => {
    const user = userEvent.setup();
    render(<Paged />);
    expect(screen.getByText("page 1 of 2, 3 rows, no filtering")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("page 2 of 2, 3 rows, no filtering")).toBeTruthy();
  });
});

describe("useTableRequest", () => {
  const remote = defineTable<User>()({
    getRowId: (user) => user.id,
    columns: (col) => [col.key("name", { sortable: true })],
    features: [remoteSorting(), remotePagination()],
  });

  it("returns the same request until a value in it changes", async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    function Remote() {
      const table = useTable(remote);
      const request = useTableRequest(table);
      const view = useTableRows(table, users, { totalCount: 30, requestKey: "stale" });
      const sort = useColumnState(table, "name", "sorting", (part) => part);
      useEffect(() => {
        seen.push(request);
      });
      return (
        <>
          <output>{JSON.stringify(request)}</output>
          <p>{`${String(view.pageCount)} pages, stale ${String(view.isStale)}, ${String(sort)}`}</p>
          <button type="button" onClick={() => table.sorting.toggle("name")}>
            sort
          </button>
          <button type="button" onClick={() => table.pagination.setPage(0)}>
            same page
          </button>
        </>
      );
    }
    render(<Remote />);
    expect(screen.getByRole("status").textContent).toBe('{"sorting":[],"pagination":{"pageIndex":0,"pageSize":10}}');
    expect(screen.getByText("3 pages, stale true, false")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "same page" }));
    await user.click(screen.getByRole("button", { name: "sort" }));
    expect(screen.getByRole("status").textContent).toBe('{"sorting":[{"id":"name","desc":false}],"pagination":{"pageIndex":0,"pageSize":10}}');
    expect(new Set(seen).size).toBe(2);
  });
});

function Page() {
  const table = useTable(userTable);
  return <DataTable table={table} data={users} />;
}

describe("server rendering", () => {
  it("renders from the server snapshots", () => {
    const html = renderToString(<Page />);
    expect(html).toContain("Cy");
    expect(html).toContain("page <!-- -->1<!-- --> of <!-- -->2");
  });

  it("keeps hooks out of the react-server entry", () => {
    expect("defineTable" in server).toBe(true);
    expect("defineCell" in server).toBe(true);
    expect("withProps" in server).toBe(true);
    expect(Object.keys(server).filter((name) => name.startsWith("use"))).toEqual([]);
  });
});

describe("stores made outside React", () => {
  it("work with the hooks", () => {
    const store = createTableStore(userTable);
    function Probe() {
      const dir = useColumnState(store, "name", "sorting", (part) => sortDir("name")([]) === part);
      return <span>{String(dir)}</span>;
    }
    render(<Probe />);
    expect(screen.getByText("true")).toBeTruthy();
  });
});
