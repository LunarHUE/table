import { act, render, renderHook, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ariaSort, selectAllInputProps, selectInputProps } from "./a11y.js";
import { useSimpleTable, type SimpleColumn, type SimpleTableOptions } from "./mini.js";

interface Person {
  readonly id: number;
  readonly name: string;
  readonly age: number | null;
  readonly team: { readonly name: string };
}

const people: readonly Person[] = [
  { id: 1, name: "Cy", age: 30, team: { name: "red" } },
  { id: 2, name: "Ada", age: 25, team: { name: "blue" } },
  { id: 3, name: "Bob", age: null, team: { name: "red" } },
  { id: 4, name: "Dee", age: 41, team: { name: "green" } },
  { id: 5, name: "Eve", age: 25, team: { name: "blue" } },
];

const columns: readonly SimpleColumn<Person>[] = [
  { id: "name", label: "Name", sortable: true },
  { id: "age", label: "Age", sortable: true },
  { id: "team", label: "Team", accessor: (p) => p.team.name },
  { id: "length", label: "Name length", compare: (a, b) => a.name.length - b.name.length || a.id - b.id, accessor: "name" },
];

const setup = (options: Partial<SimpleTableOptions<Person>> = {}) =>
  renderHook(() => useSimpleTable({ data: people, columns, ...options }));

const names = (rows: readonly { readonly original: Person }[]) => rows.map((row) => row.original.name);

describe("useSimpleTable", () => {
  it("shows every row with ids from row.id", () => {
    const { result } = setup();
    expect(result.current.rows.map((row) => row.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(result.current).toMatchObject({ pageIndex: 0, pageSize: undefined, pageCount: 1, canNext: false, filteredCount: 5, totalCount: 5 });
    expect(result.current.getValue({ id: 9, name: "Zed", age: 1, team: { name: "green" } }, "team")).toBe("green");
  });

  it("falls back to the index and takes getRowId", () => {
    const rows = [{ name: "a" }, { name: "b" }];
    const plain = renderHook(() => useSimpleTable({ data: rows, columns: [{ id: "name" }] }));
    expect(plain.result.current.rows.map((row) => row.id)).toEqual(["0", "1"]);
    const custom = renderHook(() => useSimpleTable({ data: rows, columns: [{ id: "name" }], getRowId: (row) => row.name }));
    expect(custom.result.current.rows.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("cycles the sort through asc, desc and none, with empty values last", () => {
    const { result } = setup();
    act(() => result.current.toggleSort("age"));
    expect(result.current.sort).toEqual({ id: "age", desc: false });
    expect(result.current.sortDir("age")).toBe("asc");
    expect(ariaSort(result.current.sortDir("name"))).toBe("none");
    expect(names(result.current.rows)).toEqual(["Ada", "Eve", "Cy", "Dee", "Bob"]);
    act(() => result.current.toggleSort("age"));
    expect(result.current.sortDir("age")).toBe("desc");
    expect(names(result.current.rows)).toEqual(["Dee", "Cy", "Ada", "Eve", "Bob"]);
    act(() => result.current.toggleSort("age"));
    expect(result.current.sort).toBeNull();
    expect(names(result.current.rows)).toEqual(["Cy", "Ada", "Bob", "Dee", "Eve"]);
  });

  it("uses a column's compare and initialSort", () => {
    const { result } = setup({ initialSort: { id: "length", desc: true } });
    expect(names(result.current.rows)).toEqual(["Eve", "Dee", "Bob", "Ada", "Cy"]);
    act(() => result.current.setSort({ id: "name", desc: false }));
    expect(names(result.current.rows)).toEqual(["Ada", "Bob", "Cy", "Dee", "Eve"]);
  });

  it("searches column text and numbers by default", () => {
    const { result } = setup({ initialSearch: "BLUE" });
    expect(names(result.current.rows)).toEqual(["Ada", "Eve"]);
    act(() => result.current.setSearch("41"));
    expect(names(result.current.rows)).toEqual(["Dee"]);
    act(() => result.current.setSearch("  "));
    expect(result.current.filteredCount).toBe(5);
  });

  it("takes a custom filter", () => {
    const { result } = setup({ filter: (row, query) => row.name.toLowerCase().startsWith(query) });
    act(() => result.current.setSearch("e"));
    expect(names(result.current.rows)).toEqual(["Eve"]);
    expect(result.current.search).toBe("e");
  });

  it("pages, and goes back to the first page when the sort or search changes", () => {
    const { result } = setup({ pageSize: 2 });
    expect(result.current).toMatchObject({ pageIndex: 0, pageSize: 2, pageCount: 3, canPrev: false, canNext: true });
    act(() => result.current.next());
    expect(names(result.current.rows)).toEqual(["Bob", "Dee"]);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current).toMatchObject({ pageIndex: 2, canNext: false, canPrev: true });
    expect(names(result.current.rows)).toEqual(["Eve"]);
    act(() => result.current.toggleSort("name"));
    expect(result.current.pageIndex).toBe(0);
    act(() => result.current.setPage(9));
    expect(result.current.pageIndex).toBe(2);
    act(() => result.current.setSearch("re"));
    expect(result.current).toMatchObject({ pageIndex: 0, pageCount: 2, filteredCount: 3 });
    act(() => result.current.prev());
    expect(result.current.pageIndex).toBe(0);
    act(() => result.current.setPageSize(undefined));
    expect(result.current).toMatchObject({ pageCount: 1, pageSize: undefined });
    expect(result.current.rows).toHaveLength(3);
  });

  it("clamps the page when rows go away", () => {
    const { result, rerender } = renderHook(({ data }) => useSimpleTable({ data, columns, pageSize: 2 }), { initialProps: { data: people } });
    act(() => result.current.setPage(2));
    rerender({ data: people.slice(0, 2) });
    expect(result.current.pageIndex).toBe(0);
    expect(names(result.current.rows)).toEqual(["Cy", "Ada"]);
  });

  it("selects rows and all matching rows", () => {
    const { result } = setup({ selectable: true });
    expect(result.current).toMatchObject({ allSelected: false, indeterminate: false, selectedIds: [] });
    act(() => result.current.toggleRow("2"));
    expect(result.current.isSelected("2")).toBe(true);
    expect(result.current.indeterminate).toBe(true);
    act(() => result.current.toggleAll());
    expect(result.current).toMatchObject({ allSelected: true, indeterminate: false });
    expect(result.current.selectedIds).toEqual(["2", "1", "3", "4", "5"]);
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
    act(() => result.current.setSearch("blue"));
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual(["2", "5"]);
    expect(result.current.allSelected).toBe(true);
    act(() => result.current.setSearch(""));
    expect(result.current.indeterminate).toBe(true);
    act(() => result.current.toggleRow("5"));
    expect(result.current.selectedIds).toEqual(["2"]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("ignores selection unless selectable", () => {
    const { result } = setup();
    act(() => result.current.toggleRow("1"));
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds).toEqual([]);
  });

  it("is compiled", () => {
    expect(String(useSimpleTable)).toMatch(/\$\[\d+\]/);
    expect(String(PeopleTable)).toMatch(/\$\[\d+\]/);
  });
});

function PeopleTable() {
  const t = useSimpleTable({ data: people, columns, pageSize: 3, selectable: true });
  return (
    <>
      <input aria-label="Search" value={t.search} onChange={(e) => t.setSearch(e.target.value)} />
      <table>
        <thead>
          <tr>
            <th>
              <input {...selectAllInputProps({ checked: t.allSelected, indeterminate: t.indeterminate, toggle: t.toggleAll, label: "Select all" })} />
            </th>
            {t.columns.map((column) => (
              <th key={column.id} aria-sort={ariaSort(t.sortDir(column.id))}>
                <button type="button" onClick={() => t.toggleSort(column.id)}>
                  {column.label}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row) => (
            <tr key={row.id}>
              <td>
                <input {...selectInputProps({ checked: t.isSelected(row.id), toggle: () => t.toggleRow(row.id), label: `Select ${row.original.name}` })} />
              </td>
              {t.columns.map((column) => (
                <td key={column.id}>{String(t.getValue(row.original, column.id))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" disabled={!t.canNext} onClick={t.next}>
        Next
      </button>
      <p>{`Page ${t.pageIndex + 1} of ${t.pageCount}`}</p>
    </>
  );
}

const headers = () => screen.getAllByRole("columnheader").map((th) => th.getAttribute("aria-sort"));

describe("a table with ./mini and ./a11y", () => {
  it("sorts, searches, pages and selects", async () => {
    const user = userEvent.setup();
    render(<PeopleTable />);
    expect(headers()).toEqual([null, "none", "none", "none", "none"]);
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(headers()[1]).toBe("ascending");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: "Select Dee" }));
    const all = screen.getByRole<HTMLInputElement>("checkbox", { name: "Select all" });
    expect(all.indeterminate).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "Search" }), "a");
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(all.indeterminate).toBe(false);
    await user.click(all);
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
  });
});
