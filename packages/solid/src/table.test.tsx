import { createRoot, createSignal, flush } from "solid-js";
import { describe, expect, it } from "vitest";
import {
  createCellState,
  createColumnState,
  createFeatureState,
  createIsFiltered,
  createRowState,
  createSelectAll,
  createTable,
  createTableMeta,
  createTableRequest,
  createTableRows,
  createVisibleColumns,
  defineTable,
  getSortDir,
  isSelected,
  remotePagination,
  remoteSorting,
  selectable,
  selection,
  sortDir,
  sorting,
  type CellApi,
  type HeaderApi,
  type SelectionCellApi,
  type SelectionHeaderApi,
} from "./index.js";
import { counted, get, mount, settle, texts } from "./test/dom.js";
import { DataTable, makeDef, people, selectReads, type User } from "./test/fixture.js";

const names = (host: ParentNode) => texts(host, "td[data-col=name]");

describe("a full table", () => {
  it("renders headers, cells, a plain date cell and the selection parts", () => {
    const table = createRoot(() => createTable(makeDef()));
    const { host } = mount(() => <DataTable table={table} data={people} />);
    expect(texts(host, "th")).toEqual(["", "Name", "Age", "Joined"]);
    expect(names(host)).toEqual(["Ada", "Bea"]);
    expect(texts(host, "td[data-col=joined]")).toEqual(["2020-01-02", "2021-03-04"]);
    expect(host.querySelectorAll("input.select")).toHaveLength(2);
    expect(texts(host, ".page")).toEqual(["1/3"]);
  });

  it("sorts, filters and pages as the table's state changes", async () => {
    const table = createRoot(() => createTable(makeDef()));
    const { host } = mount(() => <DataTable table={table} data={people} />);
    table.sorting.toggle("age");
    await settle();
    expect(names(host)).toEqual(["Dot", "Bea"]);
    get(host, "button.next", HTMLButtonElement).click();
    await settle();
    expect(names(host)).toEqual(["Eve", "Ada"]);
    expect(texts(host, ".page")).toEqual(["2/3"]);
    table.filtering.set("q", "a");
    await settle();
    // A filter changes the matching rows, so the page goes back to the first.
    expect(names(host)).toEqual(["Bea", "Ada"]);
    expect(texts(host, ".page")).toEqual(["1/2"]);
    get(host, "button.prev", HTMLButtonElement).click();
    await settle();
    expect(texts(host, ".page")).toEqual(["1/2"]);
  });

  it("selects through 0-arg handlers on the cell and the header", async () => {
    const table = createRoot(() => createTable(makeDef()));
    const { host } = mount(() => <DataTable table={table} data={people} />);
    get(host, "input.select[data-row=u2]", HTMLInputElement).click();
    await settle();
    expect(get(host, "input.select[data-row=u2]", HTMLInputElement).checked).toBe(true);
    expect(get(host, "input.select-all", HTMLInputElement).dataset["indeterminate"]).toBe("true");
    expect(texts(host, "output")).toEqual(["1"]);
    get(host, "input.select-all", HTMLInputElement).click();
    await settle();
    expect(get(host, "input.select[data-row=u1]", HTMLInputElement).checked).toBe(true);
    expect(get(host, "input.select-all", HTMLInputElement).checked).toBe(true);
    expect(texts(host, "output")).toEqual(["2"]);
    get(host, "input.select-all", HTMLInputElement).click();
    await settle();
    expect(texts(host, "output")).toEqual(["0"]);
  });

  it("hides a column without running the rows again", async () => {
    let runs = 0;
    const table = createRoot(() => createTable(makeDef()));
    const { host } = mount(() => <DataTable table={table} data={people} onRows={() => runs++} />);
    const before = runs;
    table.visibility.toggle("age");
    await settle();
    expect(texts(host, "th")).toEqual(["", "Name", "Joined"]);
    expect(host.querySelectorAll("td[data-col=age]")).toHaveLength(0);
    expect(runs).toBe(before);
  });
});

describe("fine-grained updates", () => {
  it("toggling a row wakes only that row's cell, and not the rows", async () => {
    let runs = 0;
    const table = createRoot(() => createTable(makeDef()));
    const { host } = mount(() => <DataTable table={table} data={people} onRows={() => runs++} />);
    selectReads.clear();
    const before = runs;
    get(host, "input.select[data-row=u1]", HTMLInputElement).click();
    await settle();
    expect(selectReads.get("u1")).toBe(1);
    expect(selectReads.get("u2")).toBeUndefined();
    expect(runs).toBe(before);
  });

  it("toggling a row runs only that row's createRowState", async () => {
    const table = createRoot(() => createTable(makeDef()));
    const runs = { u1: 0, u2: 0 };
    const states = createRoot(() => ({
      u1: createRowState(table, "u1", "selection", (part) => (runs.u1++, part)),
      u2: createRowState(table, "u2", "selection", (part) => (runs.u2++, part)),
    }));
    expect([states.u1(), states.u2()]).toEqual([false, false]);
    table.selection.toggle("u1");
    flush();
    expect([states.u1(), states.u2()]).toEqual([true, false]);
    expect(runs).toEqual({ u1: 2, u2: 1 });
  });

  it("sorting a column runs only that column's createColumnState", () => {
    const table = createRoot(() => createTable(makeDef()));
    const runs = { name: 0, age: 0 };
    const dirs = createRoot(() => ({
      name: createColumnState(table, "name", sorting, (part) => (runs.name++, part)),
      age: createColumnState(table, "age", sorting, (part) => (runs.age++, part)),
    }));
    expect([dirs.name(), dirs.age()]).toEqual([false, false]);
    table.sorting.toggle("name");
    flush();
    expect([dirs.name(), dirs.age()]).toEqual(["asc", false]);
    expect(runs).toEqual({ name: 2, age: 1 });
  });

  it("follows an accessor key to a new row", () => {
    const table = createRoot(() => createTable(makeDef()));
    const [id, setId] = createSignal("u1");
    const selected = createRoot(() => createRowState(table, id, "selection"));
    table.selection.toggle("u2");
    flush();
    expect(selected()).toBe(false);
    setId("u2");
    flush();
    expect(selected()).toBe(true);
  });
});

describe("primitives", () => {
  it("gives undefined for a feature the table lacks, and false for filters it lacks", () => {
    const def = defineTable<User>()({ getRowId: (user) => user.id, columns: (col) => [col.key("name")] });
    const table = createRoot(() => createTable(def));
    createRoot(() => {
      expect(createFeatureState(table, "selection")()).toBeUndefined();
      expect(createRowState(table, "u1", "selection", (part) => part ?? "none")()).toBe("none");
      expect(createCellState(table, "u1", "name", "selection")()).toBeUndefined();
      expect(createIsFiltered(table)()).toBe(false);
    });
  });

  it("follows the filters and the request", () => {
    const def = defineTable<User>()({
      getRowId: (user) => user.id,
      columns: (col) => [col.key("name", { sortable: true })],
      features: [remoteSorting(), remotePagination()],
    });
    const table = createRoot(() => createTable(def));
    const request = createRoot(() => createTableRequest(table));
    expect(request()).toEqual({ sorting: [], pagination: { pageIndex: 0, pageSize: 10 } });
    table.sorting.toggle("name");
    flush();
    expect(request()).toEqual({ sorting: [{ id: "name", desc: false }], pagination: { pageIndex: 0, pageSize: 10 } });
    const filtered = createRoot(() => {
      const other = createTable(makeDef());
      return { other, isFiltered: createIsFiltered(other) };
    });
    expect(filtered.isFiltered()).toBe(false);
    filtered.other.filtering.set("q", "x");
    flush();
    expect(filtered.isFiltered()).toBe(true);
  });

  it("re-checks a stale view when the request key changes", () => {
    const def = defineTable<User>()({ getRowId: (user) => user.id, columns: (col) => [col.key("name", { sortable: true })], features: [remoteSorting()] });
    const table = createRoot(() => createTable(def));
    const key = table.getRequestKey();
    const view = createRoot(() => createTableRows(table, () => people, () => ({ requestKey: key })));
    expect(view().isStale).toBe(false);
    table.sorting.toggle("name");
    flush();
    expect(view().isStale).toBe(true);
  });

  it("selects every matching row in matching scope", () => {
    const table = createRoot(() => createTable(makeDef()));
    const all = createRoot(() => {
      const view = createTableRows(table, () => people);
      return createSelectAll(table, () => view().rows, { scope: "matching" });
    });
    all().toggle();
    flush();
    expect(table.getFeatureState("selection")).toEqual({ mode: "all", except: [] });
    expect(all().checked).toBe(true);
    all().toggle();
    flush();
    expect(isSelected("u1")(table.getFeatureState("selection"))).toBe(false);
  });

  it("reads without subscribing when there is no owner", () => {
    const table = createTable(makeDef());
    const dir = createColumnState(table, "name", "sorting");
    table.sorting.toggle("name");
    expect(dir()).toBe("asc");
    expect(getSortDir(table.getFeatureState("sorting"), "name")).toBe(sortDir("name")(table.getFeatureState("sorting")));
  });
});

describe("reactive options", () => {
  it("takes new omitColumns and meta from an accessor", async () => {
    const [omit, setOmit] = createSignal<readonly string[]>(["joined"]);
    const [suffix, setSuffix] = createSignal("y");
    const { table, columns, meta } = createRoot(() => {
      const made = createTable(makeDef(), () => ({ omitColumns: omit(), meta: { suffix: suffix() } }));
      return { table: made, columns: createVisibleColumns(made), meta: createTableMeta(made) };
    });
    const { host } = mount(() => <DataTable table={table} data={people} />);
    expect(columns().map((column) => column.id)).toEqual(["select", "name", "age"]);
    expect(texts(host, "th")).toEqual(["", "Name", "Age"]);
    setOmit(["age"]);
    await settle();
    await settle();
    expect(columns().map((column) => column.id)).toEqual(["select", "name", "joined"]);
    expect(texts(host, "th")).toEqual(["", "Name", "Joined"]);
    setOmit(["joined"]);
    setSuffix("yo");
    await settle();
    await settle();
    expect(meta()).toEqual({ suffix: "yo" });
    expect(texts(host, "td[data-col=age]")).toEqual(["36yo", "29yo"]);
  });
});

describe("disposal", () => {
  it("drops every store subscription when the root is disposed", () => {
    const { table, live } = counted(createTable(makeDef()));
    const stop = createRoot((dispose) => {
      const view = createTableRows(table, () => people);
      createFeatureState(table, "selection");
      createRowState(table, "u1", "selection");
      createColumnState(table, "name", "sorting");
      createVisibleColumns(table);
      createTableRequest(table);
      view();
      return dispose;
    });
    expect(live()).toBeGreaterThan(0);
    stop();
    expect(live()).toBe(0);
  });
});

const PlainSelectCell = (props: { readonly cell: CellApi<unknown, User, SelectionCellApi> }) => (
  <input
    type="checkbox"
    class="col-part-select"
    checked={props.cell.selected}
    onChange={() => props.cell.toggleSelected()}
  />
);

const PlainSelectHeader = (props: { readonly header: HeaderApi<User, SelectionHeaderApi> }) => (
  <input
    type="checkbox"
    class="col-part-all"
    checked={props.header.checked}
    onChange={() => props.header.toggle()}
  />
);

describe("column parts without defineCell", () => {
  it("provides selection APIs to Cell and Header when selectable() is declared on column.parts", async () => {
    const def = defineTable<User>()({
      getRowId: (user) => user.id,
      columns: (col) => [
        col.custom("select", { parts: [selectable()], cell: PlainSelectCell, header: PlainSelectHeader }),
        col.key("name", { label: "Name" }),
      ],
      features: [selection()],
    });
    const table = createRoot(() => createTable(def));
    const { host } = mount(() => <DataTable table={table} data={people} />);
    const boxes = [...host.querySelectorAll<HTMLInputElement>("input.col-part-select")];
    const allBox = get(host, "input.col-part-all", HTMLInputElement);
    expect(boxes).toHaveLength(people.length);
    expect(boxes[0]?.checked).toBe(false);
    expect(allBox.checked).toBe(false);

    allBox.click();
    await settle();
    expect(boxes.every((b) => b.checked)).toBe(true);
    expect(allBox.checked).toBe(true);
  });
});
