import { For, Show } from "solid-js";
import {
  Cell,
  createHeaderGroups,
  createPagination,
  createSelection,
  createTableRows,
  createVisibleColumns,
  defineCell,
  defineColumn,
  defineTable,
  filtering,
  Header,
  hasFeature,
  pagination,
  selectable,
  selection,
  sorting,
  visibility,
  type CellApi,
  type HeaderApi,
  type PaginationTable,
  type SelectionTable,
  type SelectionCellApi,
  type SelectionHeaderApi,
  type Table,
  type TableRowsView,
} from "../index.js";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly age: number;
  readonly joined: Date;
}

export const people: readonly User[] = [
  { id: "u1", name: "Ada", age: 36, joined: new Date("2020-01-02T00:00:00Z") },
  { id: "u2", name: "Bea", age: 29, joined: new Date("2021-03-04T00:00:00Z") },
  { id: "u3", name: "Cal", age: 41, joined: new Date("2019-05-06T00:00:00Z") },
  { id: "u4", name: "Dot", age: 23, joined: new Date("2022-07-08T00:00:00Z") },
  { id: "u5", name: "Eve", age: 30, joined: new Date("2023-09-10T00:00:00Z") },
];

/** How many times each row's select cell read its selected state. */
export const selectReads = new Map<string, number>();

export const SelectCell = defineCell(
  (props: { readonly cell: CellApi<unknown, unknown, SelectionCellApi> }) => (
    <input
      type="checkbox"
      class="select"
      data-row={props.cell.row.id}
      checked={(selectReads.set(props.cell.row.id, (selectReads.get(props.cell.row.id) ?? 0) + 1), props.cell.selected)}
      onChange={props.cell.toggleSelected}
    />
  ),
  selectable(),
);

export const SelectHeader = defineCell(
  (props: { readonly header: HeaderApi<unknown, SelectionHeaderApi> }) => (
    <input
      type="checkbox"
      class="select-all"
      checked={props.header.checked}
      data-indeterminate={String(props.header.indeterminate)}
      onChange={props.header.toggle}
    />
  ),
  selectable(),
);

/** A plain value cell: no parts, no `defineCell`. */
export const DateCell = (props: { readonly cell: CellApi<Date, User> }) => (
  <time>{props.cell.value.toISOString().slice(0, 10)}</time>
);

/** A cell that shows the table's meta. */
export const AgeCell = (props: { readonly cell: CellApi<number, User> }) => {
  const suffix = () => {
    const value = props.cell.meta["suffix"];
    return typeof value === "string" ? value : "";
  };
  return (
    <span>
      {props.cell.value}
      {suffix()}
    </span>
  );
};

export interface Filters {
  readonly q?: string;
}

const matches = (user: User, filters: Filters) => !filters.q || user.name.toLowerCase().includes(filters.q);

export const makeDef = () =>
  defineTable<User>()({
    getRowId: (user) => user.id,
    columns: (col) => [
      defineColumn("select", { parts: [selectable()], cell: SelectCell, header: SelectHeader }),
      col.key("name", { sortable: true, label: "Name" }),
      col.key("age", { sortable: true, label: "Age", cell: AgeCell }),
      col.key("joined", { label: "Joined", cell: DateCell }),
    ],
    features: [sorting(), filtering<Filters, User>({ rows: matches, initial: {} }), pagination({ sizes: [2, 5] }), selection(), visibility()],
  });

/** Next and previous buttons, with the 0-arg commands as handlers. */
function Pager(props: { readonly table: PaginationTable; readonly view: () => TableRowsView<unknown> }) {
  const pager = createPagination(props.table, props.view);
  return (
    <nav>
      <button class="prev" disabled={!pager.canPrev} onClick={pager.prev}>
        prev
      </button>
      <span class="page">
        {pager.pageIndex + 1}/{pager.pageCount}
      </span>
      <button class="next" disabled={!pager.canNext} onClick={pager.next}>
        next
      </button>
    </nav>
  );
}

/**
 * One table component for any rows. It reads features through `hasFeature`,
 * so it renders tables without pagination or selection too.
 */
export function DataTable<TRow>(props: { readonly table: Table<TRow>; readonly data: readonly TRow[]; readonly onRows?: () => void }) {
  const view = createTableRows(props.table, () => {
    props.onRows?.();
    return props.data;
  });
  const headerGroups = createHeaderGroups(props.table);
  const columns = createVisibleColumns(props.table);
  const table = props.table;
  return (
    <div>
      <table>
        <thead>
          <For each={headerGroups()}>
            {(group) => (
              <tr>
                <For each={group.headers}>
                  {(header) => (
                    <th data-col={header.columnId}>
                      <Header table={props.table} header={header} rows={view().rows} />
                    </th>
                  )}
                </For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) => (
              <tr data-row={row.id}>
                <For each={columns()}>
                  {(column) => (
                    <td data-col={column.id}>
                      <Cell table={props.table} row={row} column={column} />
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Show when={hasFeature(table, pagination) ? table : undefined} keyed>
        {(paged) => <Pager table={paged} view={view} />}
      </Show>
      <Show when={hasFeature(table, selection) ? table : undefined} keyed>
        {(withSelection) => <SelectionCount table={withSelection} view={view} />}
      </Show>
    </div>
  );
}

function SelectionCount(props: {
  readonly table: SelectionTable;
  readonly view: () => TableRowsView<unknown>;
}) {
  const summary = createSelection(props.table, props.view);
  return <output>{summary().count}</output>;
}
