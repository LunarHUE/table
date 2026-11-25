import { act, render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { startTransition, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defineTable,
  filtering,
  pagination,
  selection,
  sorting,
  useAllColumns,
  useFeatureState,
  useTable,
  useTableRows,
  useVisibleColumns,
  visibility,
  type ControlledGroupBinding,
  type ExternalBinding,
  type StateOf,
  type TableStore,
} from "./index.js";
import { counts, since, track } from "./test/fixtures.js";

// One table, three owners: React state holds sorting, filtering and
// pagination together, as a router's search params would; an outside store
// holds visibility, as local storage or Zustand would; and the table keeps
// selection itself.

interface Member {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
}

const members: readonly Member[] = [
  { id: "1", name: "carol", role: "member" },
  { id: "2", name: "alice", role: "admin" },
  { id: "3", name: "bob", role: "member" },
  { id: "4", name: "alicia", role: "member" },
  { id: "5", name: "dave", role: "admin" },
];

interface Filters {
  readonly search: string;
  readonly role?: "admin" | "member";
}

const membersTable = defineTable<Member>()({
  getRowId: (member) => member.id,
  columns: (col) => [col.key("name", { sortable: true }), col.key("role")],
  features: [
    sorting(),
    filtering<Filters, Member>({
      initial: { search: "" },
      rows: (member, filters) =>
        member.name.includes(filters.search) && (filters.role === undefined || member.role === filters.role),
    }),
    pagination({ sizes: [2, 10] }),
    visibility(),
    selection(),
  ],
});

type State = StateOf<typeof membersTable>;
type Url = Pick<State, "sorting" | "filtering" | "pagination">;
type MembersTable = TableStore<typeof membersTable>;

const startUrl: Url = { sorting: [], filtering: { search: "" }, pagination: { pageIndex: 0, pageSize: 2 } };

/** A visibility store outside React, with a count of its writes. */
function visibilityStore() {
  let value: State["visibility"] = { hidden: [] };
  const listeners = new Set<() => void>();
  const writes: State["visibility"][] = [];
  const binding: ExternalBinding<State["visibility"]> = {
    get: () => value,
    set: (next) => {
      value = next;
      writes.push(next);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return { binding, writes, listeners };
}

let store = visibilityStore();
/** Each `onStateChange` call on the URL group, in order. */
let urlCalls: Url[] = [];

beforeEach(() => {
  store = visibilityStore();
  urlCalls = [];
});

const names = () =>
  screen
    .queryAllByTestId(/^row-/)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");

interface PartProps {
  readonly table: MembersTable;
}

function Rows({ table }: PartProps) {
  const view = useTableRows(table, members);
  const columns = useVisibleColumns(table);
  track("rows");
  return (
    <>
      <table>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} data-testid={`row-${row.id}`}>
              {columns.map((column) => (
                <td key={column.id}>{String(column.column.getValue?.(row.original))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p data-testid="counts">{`${view.matchingCount} matching`}</p>
    </>
  );
}

/** Reads the rows view and nothing else, to show which writes wake it. */
function RowsOnly({ table }: PartProps) {
  const view = useTableRows(table, members);
  track("rows-only");
  return <p data-testid="rows-only">{view.rows.length}</p>;
}

function ColumnMenu({ table }: PartProps) {
  const all = useAllColumns(table);
  const shown = useVisibleColumns(table);
  track("menu");
  return (
    <p data-testid="menu">{`all ${all.map((column) => column.id).join(",")}; shown ${shown.map((column) => column.id).join(",")}`}</p>
  );
}

function SelectionState({ table }: PartProps) {
  const state = useFeatureState(table, "selection");
  return <p data-testid="selection">{state.mode}</p>;
}

interface AppProps {
  /** Runs in place of the URL's `setState`, so a test can watch or slow it. */
  readonly navigate?: (apply: () => void) => void;
}

const now = (apply: () => void) => apply();

function App({ navigate: given }: AppProps) {
  const navigate = given ?? now;
  const [url, setUrl] = useState<Url>(startUrl);
  const group: ControlledGroupBinding<Url> = {
    kind: "controlled-group",
    state: url,
    onStateChange: (updater) =>
      navigate(() =>
        setUrl((prev) => {
          const next = updater(prev);
          urlCalls.push(next);
          return next;
        }),
      ),
  };
  const table = useTable(membersTable, {
    bind: { sorting: group, filtering: group, pagination: group, visibility: store.binding },
  });
  return (
    <>
      <input
        aria-label="search"
        value={url.filtering.search}
        onChange={(event) => table.filtering.set("search", event.target.value)}
      />
      <button
        type="button"
        onClick={() => {
          table.filtering.set("search", "ali");
          table.filtering.set("role", "member");
          table.sorting.toggle("name");
        }}
      >
        three commands
      </button>
      <button type="button" onClick={() => table.pagination.setPage(1)}>
        page 2
      </button>
      <button type="button" onClick={() => table.selection.selectAllMatching()}>
        select all
      </button>
      <button type="button" onClick={() => table.visibility.toggle("role")}>
        hide role
      </button>
      <output data-testid="url">{JSON.stringify(url)}</output>
      <Rows table={table} />
      <RowsOnly table={table} />
      <ColumnMenu table={table} />
      <SelectionState table={table} />
    </>
  );
}

const isUrl = (value: unknown): value is Url =>
  typeof value === "object" && value !== null && "sorting" in value && "filtering" in value && "pagination" in value;

/** The URL state `App` last rendered. */
function shownUrl(): Url {
  const parsed: unknown = JSON.parse(screen.getByTestId("url").textContent ?? "null");
  if (!isUrl(parsed)) throw new Error("App rendered no URL state.");
  return parsed;
}

/** Two filter edits in one handler, the second undoing the first. */
function Undo() {
  const [state, setState] = useState<Url>(startUrl);
  const group: ControlledGroupBinding<Url> = { kind: "controlled-group", state, onStateChange: setState };
  const table = useTable(membersTable, { bind: { sorting: group, filtering: group, pagination: group } });
  return (
    <>
      <button
        type="button"
        onClick={() => {
          table.filtering.set("search", "ali");
          table.filtering.set("search", "");
        }}
      >
        type and erase
      </button>
      <output>{state.filtering.search}</output>
    </>
  );
}

describe("a table with three owners", () => {
  it("resets the page in the same URL change as the filter, and clears an all-matching selection", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "page 2" }));
    await user.click(screen.getByRole("button", { name: "select all" }));
    expect(shownUrl().pagination.pageIndex).toBe(1);
    expect(screen.getByTestId("selection").textContent).toBe("all");

    urlCalls = [];
    await user.type(screen.getByRole("textbox", { name: "search" }), "a");
    // One URL change carries the filter and the page reset. A second call would
    // mean the router pushes a history entry for page 2 with the new filter.
    // StrictMode runs each updater twice, so count distinct results.
    const changes = new Set(urlCalls.map((call) => JSON.stringify(call)));
    expect(changes.size).toBe(1);
    expect(shownUrl().filtering).toEqual({ search: "a" });
    expect(shownUrl().pagination).toEqual({ pageIndex: 0, pageSize: 2 });
    expect(screen.getByTestId("selection").textContent).toBe("ids");
  });

  it("lands every command of one handler: two filter edits and a sort", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "three commands" }));
    expect(shownUrl().filtering).toEqual({ search: "ali", role: "member" });
    expect(shownUrl().sorting).toEqual([{ id: "name", desc: false }]);
    expect(names()).toEqual(["alicia"]);
  });

  it("lands a filter edit that undoes the one before it in the same handler", () => {
    render(<Undo />);
    act(() => screen.getByRole("button", { name: "type and erase" }).click());
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("keeps urgent typing whole while a navigation runs in a transition", async () => {
    const user = userEvent.setup();
    // The search box is the URL's own state here, so every keystroke goes
    // through the controlled group. A real router commits the URL in a
    // transition; the input must still show each character at once.
    let transitions = 0;
    function Search() {
      const [text, setText] = useState("");
      const [committed, setCommitted] = useState<Url>(startUrl);
      const group: ControlledGroupBinding<Url> = {
        kind: "controlled-group",
        state: committed,
        onStateChange: (updater) => {
          transitions += 1;
          startTransition(() => setCommitted(updater));
        },
      };
      const table = useTable(membersTable, { bind: { sorting: group, filtering: group, pagination: group } });
      return (
        <>
          <input
            aria-label="search"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              table.filtering.set("search", event.target.value);
            }}
          />
          <output>{committed.filtering.search}</output>
          <Rows table={table} />
        </>
      );
    }
    render(<Search />);
    const box = screen.getByRole<HTMLInputElement>("textbox", { name: "search" });
    await user.type(box, "alic");
    expect(box.value).toBe("alic");
    expect(transitions).toBe(4);
    expect(screen.getByRole("status").textContent).toBe("alic");
    expect(names()).toEqual(["alice", "alicia"]);
  });

  it("shows only what the URL holds in an input bound to it while a slow navigation is pending", async () => {
    const user = userEvent.setup();
    // Each URL change waits for the test, as a router waits for a loader.
    const pending: (() => void)[] = [];
    render(<App navigate={(apply) => pending.push(() => startTransition(apply))} />);
    const box = screen.getByRole<HTMLInputElement>("textbox", { name: "search" });
    await user.type(box, "al");
    // The input reads the URL, so nothing shows until the navigation lands.
    expect(box.value).toBe("");
    expect(pending).toHaveLength(2);
    act(() => pending.splice(0).forEach((run) => run()));
    // The second keystroke was typed into an input still showing "", so the
    // URL ends at "l": the controlled input is only as fast as its owner.
    expect(shownUrl().filtering.search).toBe("l");

    // With the navigation landing as each key arrives, every character stays.
    await user.clear(box);
    act(() => pending.splice(0).forEach((run) => run()));
    for (const key of "alice") {
      await user.type(box, key);
      act(() => pending.splice(0).forEach((run) => run()));
    }
    expect(box.value).toBe("alice");
    expect(names()).toEqual(["alice"]);
  });

  it("hides a column through the outside store without waking the rows view", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId("menu").textContent).toBe("all name,role; shown name,role");
    const before = counts();
    await user.click(screen.getByRole("button", { name: "hide role" }));
    expect(store.writes).toEqual([{ hidden: ["role"] }]);
    expect(screen.getByTestId("menu").textContent).toBe("all name,role; shown name");
    expect(since(before, "rows-only")).toBe(0);
    expect(since(before, "menu")).toBeGreaterThan(0);
    // The body re-renders only because it reads the visible columns.
    expect(screen.getByTestId("row-1").textContent).toBe("carol");
    expect(urlCalls).toEqual([]);

    // A write from outside the table reaches it the same way.
    const outside = counts();
    act(() => store.binding.set({ hidden: [] }));
    expect(screen.getByTestId("menu").textContent).toBe("all name,role; shown name,role");
    expect(since(outside, "rows-only")).toBe(0);
  });

  it("drops its subscription to the outside store on unmount", () => {
    const view = render(<App />);
    expect(store.listeners.size).toBeGreaterThan(0);
    view.unmount();
    expect(store.listeners.size).toBe(0);
  });
});

describe("console", () => {
  const spies: ReturnType<typeof vi.spyOn>[] = [];
  beforeEach(() => {
    spies.push(vi.spyOn(console, "error"), vi.spyOn(console, "warn"));
  });
  afterEach(() => {
    spies.splice(0).forEach((spy) => spy.mockRestore());
  });

  it("stays quiet through a mixed-owner session", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "three commands" }));
    await user.click(screen.getByRole("button", { name: "hide role" }));
    await user.click(screen.getByRole("button", { name: "select all" }));
    await user.type(screen.getByRole("textbox", { name: "search" }), "x");
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
