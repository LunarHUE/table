import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  startTransition,
  Suspense,
  use,
  useDebugValue,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Cell,
  defineTable,
  filtering,
  Header,
  remoteFiltering,
  remoteSorting,
  selectable,
  selection,
  sorting,
  useFeatureState,
  useHeaderGroups,
  useTable,
  useTableRows,
  useVisibleColumns,
  type CellApi,
  type HeaderApi,
  type Row,
  type SelectionCellApi,
  type SelectionHeaderApi,
  type TableStore,
} from "./index.js";

// React 19 replays a render that suspended or was interrupted, and hooks
// such as `useDeferredValue` render a component twice for one change: once
// with the old value and once in the background with the new one. Tables
// built on a mutable instance read state that moved on between the two
// renders (TanStack/table#6577). These tests drive a table through deferred
// values, `useDebugValue`, transitions and `use(promise)`, and check every
// commit for torn rows: cells from two data versions, or a row order no
// state ever asked for.

interface Item {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

interface Dataset {
  readonly version: number;
  readonly items: readonly Item[];
}

// Not in alphabetical order, so sorting by name always moves rows.
const people = ["eve", "ada", "fay", "bob", "dee", "cy"];

/** Each version renames every item and reshuffles the scores, which stay unique so sorts never tie. */
const dataset = (version: number): Dataset => ({
  version,
  items: people.map((name, i) => ({ id: String(i), name: `${name}@${version}`, score: (i * 5 + version) % people.length })),
});

interface SortEntry {
  readonly id: string;
  readonly desc: boolean;
}

const valueOf = (item: Item, id: string): string | number => (id === "score" ? item.score : item.name);

/** The ids in the order a sort and filter ask for, worked out without the table. */
function expectedIds(items: readonly Item[], sort: readonly SortEntry[], q: string): string[] {
  const kept = items.filter((item) => item.name.includes(q));
  // The lib is ES2020, which has no `toSorted`; this sorts a copy.
  // oxlint-disable-next-line unicorn/no-array-sort
  const sorted = [...kept].sort((a, b) => {
    for (const entry of sort) {
      const x = valueOf(a, entry.id);
      const y = valueOf(b, entry.id);
      if (x !== y) return (x < y ? -1 : 1) * (entry.desc ? -1 : 1);
    }
    return 0;
  });
  return sorted.map((item) => item.id);
}

let errors: ReturnType<typeof vi.spyOn>;
let warnings: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errors = vi.spyOn(console, "error");
  warnings = vi.spyOn(console, "warn");
});

afterEach(() => {
  // StrictMode is on for every render here, so this also covers its warnings.
  const logged = [...errors.mock.calls, ...warnings.mock.calls];
  errors.mockRestore();
  warnings.mockRestore();
  if (logged.length > 0) throw new Error(`React logged:\n${logged.map((call) => call.map(String).join(" ")).join("\n")}`);
});

interface NameCellProps {
  readonly cell: CellApi<string, Item>;
}

function NameCell({ cell }: NameCellProps) {
  return <span data-part="name">{cell.value}</span>;
}

interface ScoreCellProps {
  readonly cell: CellApi<number, Item>;
}

function ScoreCell({ cell }: ScoreCellProps) {
  // The value and the row come from one snapshot, so they must agree.
  return <span data-part="score">{`${cell.row.original.name}=${cell.value}`}</span>;
}

interface Filters {
  readonly q: string;
}

const scoreTable = defineTable<Item>()({
  getRowId: (item) => item.id,
  columns: (col) => [col.key("name", { sortable: true, cell: NameCell }), col.key("score", { sortable: true, cell: ScoreCell })],
  features: [sorting(), filtering<Filters, Item>({ initial: { q: "" }, rows: (item, filters) => item.name.includes(filters.q) })],
});

type ScoreTable = TableStore<typeof scoreTable>;

/** A custom table hook, with `useDebugValue` and a deferred copy of the data, as an app's would be. */
function useScoreTable(data: Dataset) {
  const table = useTable(scoreTable);
  const deferred = useDeferredValue(data);
  const view = useTableRows(table, deferred.items);
  useDebugValue(view.rows.length, (count) => `${count} rows of v${deferred.version}`);
  return { table, view, deferred };
}

/** Another custom hook that only labels state for DevTools. */
function useSortLabel(table: ScoreTable): string {
  const sort = useFeatureState(table, "sorting");
  const label = sort.map((entry) => `${entry.id}:${entry.desc ? "desc" : "asc"}`).join(",");
  useDebugValue(label);
  return label;
}

/** What one commit showed: each row's id, name and score cell text. */
interface Shown {
  readonly ids: readonly string[];
  readonly names: readonly string[];
  readonly scores: readonly string[];
}

interface GridProps {
  readonly table: ScoreTable;
  readonly rows: readonly Row<Item>[];
  readonly onCommit: (body: HTMLTableSectionElement | null) => void;
}

function Grid({ table, rows, onCommit }: GridProps) {
  const shownRows = useDeferredValue(rows);
  const headerGroups = useHeaderGroups(table);
  const columns = useVisibleColumns(table);
  const label = useSortLabel(table);
  const body = useRef<HTMLTableSectionElement>(null);
  useLayoutEffect(() => {
    onCommit(body.current);
  });
  return (
    <table data-sort={label}>
      <thead>
        {headerGroups.map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <th key={header.id}>
                <Header table={table} header={header} rows={shownRows} />
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody ref={body}>
        {shownRows.map((row) => (
          <tr key={row.id} data-id={row.id}>
            {columns.map((column) => (
              <td key={column.id}>
                <Cell table={table} row={row} column={column} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Handle {
  readonly table: ScoreTable;
  readonly setData: (data: Dataset) => void;
}

interface ReplayProps {
  readonly onReady: (handle: Handle) => void;
  readonly onCommit: (body: HTMLTableSectionElement | null) => void;
}

const firstData = () => dataset(0);

function Replay({ onReady, onCommit }: ReplayProps) {
  const [data, setData] = useState(firstData);
  const { table, view } = useScoreTable(data);
  useEffect(() => {
    onReady({ table, setData });
  }, [table, onReady]);
  return <Grid table={table} rows={view.rows} onCommit={onCommit} />;
}

const read = (body: HTMLTableSectionElement | null): Shown => {
  const rows = [...(body?.querySelectorAll("tr") ?? [])];
  return {
    ids: rows.map((row) => row.dataset["id"] ?? ""),
    names: rows.map((row) => row.querySelector("[data-part=name]")?.textContent ?? ""),
    scores: rows.map((row) => row.querySelector("[data-part=score]")?.textContent ?? ""),
  };
};

interface Seen {
  readonly sort: readonly SortEntry[];
  readonly q: string;
}

/** Checks one commit: one data version throughout, cells that agree with their rows, and an order some state asked for. */
function checkCommit(shown: Shown, states: readonly Seen[]): void {
  const versions = new Set(shown.names.map((name) => name.split("@")[1]));
  expect(versions.size).toBeLessThanOrEqual(1);
  const [version] = [...versions];
  if (version === undefined) return;
  const data = dataset(Number(version));
  shown.ids.forEach((id, i) => {
    const item = data.items.find((entry) => entry.id === id);
    expect(shown.names[i]).toBe(item?.name);
    expect(shown.scores[i]).toBe(`${item?.name}=${item?.score}`);
  });
  const orders = states.map((state) => expectedIds(data.items, state.sort, state.q).join(","));
  expect(orders).toContain(shown.ids.join(","));
}

describe("deferred values and useDebugValue", () => {
  it("commits no torn rows through rapid urgent and transition updates", async () => {
    let handle: Handle | undefined;
    const commits: Shown[] = [];
    const onReady = (next: Handle) => {
      handle = next;
    };
    await act(async () => {
      render(<Replay onReady={onReady} onCommit={(body) => commits.push(read(body))} />);
    });
    if (!handle) throw new Error("Replay never mounted.");
    const { table } = handle;
    const states: Seen[] = [{ sort: [], q: "" }];
    const note = () => states.push({ sort: table.getFeatureState("sorting"), q: table.getFeatureState("filtering").q });

    for (let round = 1; round <= 16; round++) {
      const setData = handle.setData;
      await act(async () => {
        startTransition(() => setData(dataset(round)));
        if (round % 2 === 1) table.sorting.toggle(round % 3 === 0 ? "score" : "name");
        note();
        if (round % 4 === 0) table.filtering.set("q", round % 8 === 0 ? "" : "e");
        note();
        // A table write inside a transition, which the table must still treat as urgent.
        startTransition(() => table.sorting.toggle("score"));
        note();
        startTransition(() => setData(dataset(round)));
      });
    }

    expect(commits.length).toBeGreaterThan(16);
    // The commits went through many data versions, so the checks below saw real churn.
    expect(new Set(commits.map((shown) => shown.names[0]?.split("@")[1])).size).toBeGreaterThan(4);
    // A render loop would hit React's update limit long before this.
    expect(commits.length).toBeLessThan(400);
    for (const shown of commits) checkCommit(shown, states);

    const last = commits[commits.length - 1];
    const final = expectedIds(dataset(16).items, table.getFeatureState("sorting"), table.getFeatureState("filtering").q);
    expect(last?.ids).toEqual(final);
    expect(read(screen.getByRole("table").querySelector("tbody")).ids).toEqual(final);
  });

  it("settles on the newest data when urgent writes interrupt a deferred render", async () => {
    let handle: Handle | undefined;
    const commits: Shown[] = [];
    await act(async () => {
      render(
        <Replay
          onReady={(next) => {
            handle = next;
          }}
          onCommit={(body) => commits.push(read(body))}
        />,
      );
    });
    if (!handle) throw new Error("Replay never mounted.");
    const { table, setData } = handle;
    const states: Seen[] = [{ sort: [], q: "" }];
    await act(async () => {
      for (let version = 1; version <= 5; version++) {
        setData(dataset(version));
        table.sorting.toggle("score");
        states.push({ sort: table.getFeatureState("sorting"), q: "" });
      }
    });
    for (const shown of commits) checkCommit(shown, states);
    expect(commits[commits.length - 1]?.names.every((name) => name.endsWith("@5"))).toBe(true);
  });
});

// Server-side rows through `use(promise)`. The filter bar and the header
// row sit outside the Suspense boundary, so they render before any data.

interface Page {
  readonly items: readonly Item[];
  readonly totalCount: number;
  readonly requestKey: string;
}

interface Request {
  readonly sorting: readonly SortEntry[];
  readonly filtering: Filters;
}

/** A fake backend: one promise per request key, resolved when the test says. */
function createServer(data: Dataset) {
  const pending = new Map<string, { readonly promise: Promise<Page>; readonly resolve: () => void }>();
  const keys: string[] = [];
  const fetchPage = (request: Request, requestKey: string): Promise<Page> => {
    const known = pending.get(requestKey);
    if (known) return known.promise;
    let settle: ((page: Page) => void) | undefined;
    const promise = new Promise<Page>((resolve) => {
      settle = resolve;
    });
    const ids = expectedIds(data.items, request.sorting, request.filtering.q);
    const items = ids.flatMap((id) => data.items.filter((item) => item.id === id));
    pending.set(requestKey, { promise, resolve: () => settle?.({ items, totalCount: items.length, requestKey }) });
    keys.push(requestKey);
    return promise;
  };
  const resolve = async (requestKey: string | undefined) => {
    const entry = requestKey === undefined ? undefined : pending.get(requestKey);
    if (!entry) throw new Error(`No request ${String(requestKey)}.`);
    await act(async () => {
      entry.resolve();
      await entry.promise;
    });
  };
  return { fetchPage, resolve, keys };
}

type Server = ReturnType<typeof createServer>;

interface PickCellProps {
  readonly cell: CellApi<unknown, Item, SelectionCellApi>;
}

function PickCell({ cell }: PickCellProps) {
  return <input type="checkbox" aria-label={`pick ${cell.row.id}`} checked={cell.selected} onChange={cell.toggleSelected} />;
}

interface PickAllProps {
  readonly header: HeaderApi<Item, SelectionHeaderApi>;
}

function PickAll({ header }: PickAllProps) {
  return (
    <input
      type="checkbox"
      aria-label="pick all"
      checked={header.checked}
      data-indeterminate={String(header.indeterminate)}
      onChange={header.toggle}
    />
  );
}

const remoteTable = defineTable<Item>()({
  getRowId: (item) => item.id,
  columns: (col) => [
    col.custom("pick", { parts: [selectable()], cell: PickCell, header: PickAll }),
    col.key("name", { sortable: true, cell: NameCell }),
    col.key("score", { sortable: true }),
  ],
  features: [remoteSorting(), remoteFiltering<Filters>({ initial: { q: "" } }), selection()],
});

type RemoteTable = TableStore<typeof remoteTable>;

interface SkeletonProps {
  readonly table: RemoteTable;
}

/** The fallback: a placeholder row labelled by each column's header, with no rows to select. */
function Skeleton({ table }: SkeletonProps) {
  const headerGroups = useHeaderGroups(table);
  const headers = headerGroups[headerGroups.length - 1]?.headers ?? [];
  return (
    <tbody data-testid="skeleton">
      <tr>
        {headers.map((header) => (
          <td key={header.id}>
            <Header table={table} header={header} />
          </td>
        ))}
      </tr>
    </tbody>
  );
}

interface BodyProps {
  readonly table: RemoteTable;
  readonly promise: Promise<Page>;
}

function Body({ table, promise }: BodyProps) {
  const page = use(promise);
  const view = useTableRows(table, page.items, { totalCount: page.totalCount, requestKey: page.requestKey });
  const columns = useVisibleColumns(table);
  return (
    <tbody data-testid="body" data-stale={String(view.isStale)}>
      {view.rows.map((row) => (
        <tr key={row.id} data-id={row.id}>
          {columns.map((column) => (
            <td key={column.id}>
              <Cell table={table} row={row} column={column} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

interface ShellProps {
  readonly server: Server;
}

function Shell({ server }: ShellProps) {
  const table = useTable(remoteTable);
  const [promise, setPromise] = useState(() => server.fetchPage(table.getRequest(), table.getRequestKey()));
  const headerGroups = useHeaderGroups(table);
  const filters = useFeatureState(table, "filtering");
  const refetch = () => {
    startTransition(() => setPromise(server.fetchPage(table.getRequest(), table.getRequestKey())));
  };
  return (
    <>
      <input
        aria-label="search"
        value={filters.q}
        onChange={(event) => {
          table.filtering.set("q", event.target.value);
          refetch();
        }}
      />
      <button
        type="button"
        onClick={() => {
          table.sorting.toggle("name");
          refetch();
        }}
      >
        sort by name
      </button>
      <table>
        <thead>
          {headerGroups.map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  <Header table={table} header={header} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <Suspense fallback={<Skeleton table={table} />}>
          <Body table={table} promise={promise} />
        </Suspense>
      </table>
    </>
  );
}

const bodyIds = () =>
  within(screen.getByTestId("body"))
    .getAllByRole("row")
    .map((row) => row.dataset["id"]);

const stale = () => screen.getByTestId("body").dataset["stale"];

// Testing Library's `userEvent` wraps each event in a synchronous `act`, and
// React warns when a transition suspends inside one. These events go through
// an awaited `act` instead, so the suspended transition can retry.
const clickSort = () =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "sort by name" }));
  });

const search = (text: string) =>
  act(async () => {
    fireEvent.change(screen.getByRole("textbox", { name: "search" }), { target: { value: text } });
  });

const pick = (id: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("checkbox", { name: `pick ${id}` }));
  });

describe("use(promise) behind Suspense", () => {
  it("renders headers over the skeleton, then rows, and flags rows stale until the matching page lands", async () => {
    const data = dataset(2);
    const server = createServer(data);
    await act(async () => {
      render(<Shell server={server} />);
    });

    // No rows yet: the skeleton shows, and headers outside and inside it render without rows.
    expect(screen.getByTestId("skeleton")).toBeTruthy();
    expect(screen.queryByTestId("body")).toBeNull();
    const thead = screen.getAllByRole("rowgroup")[0];
    if (!thead) throw new Error("No table head.");
    const pickAll = within(thead).getByRole<HTMLInputElement>("checkbox", { name: "pick all" });
    expect(pickAll.checked).toBe(false);
    expect(pickAll.dataset["indeterminate"]).toBe("false");
    expect(within(thead).getByRole("columnheader", { name: "name" })).toBeTruthy();
    expect(within(screen.getByTestId("skeleton")).getAllByRole("checkbox")).toHaveLength(1);

    await server.resolve(server.keys[0]);
    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(bodyIds()).toEqual(expectedIds(data.items, [], ""));
    expect(stale()).toBe("false");

    // Sorting starts a transition. The old rows stay on screen, marked stale.
    await clickSort();
    expect(screen.queryByTestId("skeleton")).toBeNull();
    expect(bodyIds()).toEqual(expectedIds(data.items, [], ""));
    expect(stale()).toBe("true");

    await server.resolve(server.keys[1]);
    const byName = expectedIds(data.items, [{ id: "name", desc: false }], "");
    expect(byName).not.toEqual(expectedIds(data.items, [], ""));
    expect(bodyIds()).toEqual(byName);
    expect(stale()).toBe("false");
  });

  it("ignores a page that lands after a newer request", async () => {
    const data = dataset(3);
    const server = createServer(data);
    await act(async () => {
      render(<Shell server={server} />);
    });
    await server.resolve(server.keys[0]);

    await clickSort();
    await search("e");
    const [, sorted, searched] = server.keys;
    expect(server.keys).toHaveLength(3);
    expect(stale()).toBe("true");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "search" }).value).toBe("e");

    // The newer request answers first and shows.
    await server.resolve(searched);
    const wanted = expectedIds(data.items, [{ id: "name", desc: false }], "e");
    expect(bodyIds()).toEqual(wanted);
    expect(stale()).toBe("false");

    // The older one answers late. Nothing renders it.
    await server.resolve(sorted);
    expect(bodyIds()).toEqual(wanted);
    expect(stale()).toBe("false");
  });

  it("keeps selection on the rows of the page it was made on", async () => {
    const server = createServer(dataset(1));
    await act(async () => {
      render(<Shell server={server} />);
    });
    await server.resolve(server.keys[0]);
    await pick("2");
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "pick 2" }).checked).toBe(true);
    // The header outside Suspense has no rows, so it never claims a partial selection.
    expect(screen.getByRole("checkbox", { name: "pick all" }).dataset["indeterminate"]).toBe("false");
  });
});

// The Compiler's output reads its memo cache as `$[n]`. Uncompiled code never does.
const compiled = /\$\[\d+\]/;

it("runs the React Compiler over every component and hook in this file", () => {
  for (const fn of [NameCell, ScoreCell, Grid, Replay, useScoreTable, useSortLabel, PickCell, PickAll, Skeleton, Body, Shell]) {
    expect(String(fn)).toMatch(compiled);
  }
});
