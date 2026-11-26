import {
  Cell,
  type CellApi,
  createColumnState,
  createFeatureState,
  createHeaderGroups,
  createTable,
  createTableRows,
  createVisibleColumns,
  defineTable,
  filtering,
  Header,
  type HeaderApi,
  type HeaderCell,
  hasFeature,
  sorting,
  type TableStore,
} from "@lunarhue/table-solid";
import { For } from "solid-js";
import { formatDate, formatMoney, type Invoice, invoices, type Status, statuses, statusLabels } from "../data.ts";

// A table that installs only sorting and filtering. Features are separate
// imports, so pagination, selection and column layout stay out of the bundle.
// `@lunarhue/table-solid` has no `/mini` entry yet; this is the small path.

interface CompactFilters {
  readonly statuses: readonly Status[];
}

function StatusCell(props: { readonly cell: CellApi<Status, Invoice> }) {
  return <span class={["badge", `badge-${props.cell.value}`]}>{statusLabels[props.cell.value]}</span>;
}

function DateCell(props: { readonly cell: CellApi<string, Invoice> }) {
  return <time datetime={props.cell.value}>{formatDate(props.cell.value)}</time>;
}

function AmountCell(props: { readonly cell: CellApi<number, Invoice> }) {
  return <span class="num">{formatMoney(props.cell.value)}</span>;
}

const sortDirOf = (value: unknown): "asc" | "desc" | false => (value === "asc" || value === "desc" ? value : false);

/** A header component that sorts its column. It reads only its own column's sort. */
function SortHeader(props: { readonly header: HeaderApi<Invoice> }) {
  const dir = createColumnState(props.header.table, () => props.header.header.id, "sorting", sortDirOf);
  return (
    <button
      type="button"
      class="sort"
      onClick={(event) => {
        const table = props.header.table;
        if (hasFeature(table, sorting)) table.sorting.toggle(props.header.header.id, { multi: event.shiftKey });
      }}
    >
      {props.header.header.label}
      <span class={["sort-icon", { active: dir() !== false }]} aria-hidden="true">
        {dir() === "asc" ? "▲" : dir() === "desc" ? "▼" : "↕"}
      </span>
    </button>
  );
}

const ariaSort = (dir: "asc" | "desc" | false): "ascending" | "descending" | "none" =>
  dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";

/** The `<th>` carries `aria-sort`; the header component inside it is the button. */
function SortTh(props: { readonly table: CompactTable; readonly header: HeaderCell<Invoice> }) {
  const dir = createColumnState(props.table, () => props.header.id, "sorting", sortDirOf);
  return (
    <th aria-sort={ariaSort(dir())}>
      <Header table={props.table} header={props.header} />
    </th>
  );
}

const compactTable = defineTable<Invoice>()({
  getRowId: (invoice) => invoice.id,
  columns: (col) => [
    col.key("customer", { label: "Customer", sortable: true, header: SortHeader }),
    col.key("status", { label: "Status", sortable: true, header: SortHeader, cell: StatusCell }),
    col.key("issued", { label: "Issued", sortable: true, header: SortHeader, cell: DateCell }),
    col.key("amount", { label: "Amount", sortable: true, header: SortHeader, cell: AmountCell }),
  ],
  features: [
    sorting(),
    filtering<CompactFilters, Invoice>({
      initial: { statuses: [] },
      rows: (invoice, filters) => filters.statuses.length === 0 || filters.statuses.includes(invoice.status),
    }),
  ],
  initialState: { sorting: [{ id: "issued", desc: true }] },
});

type CompactTable = TableStore<typeof compactTable>;

const rows = invoices.slice(0, 16);

export function CompactExample() {
  const table = createTable(compactTable);
  const view = createTableRows(table, () => rows);
  const headerGroups = createHeaderGroups(table);
  const columns = createVisibleColumns(table);
  const filters = createFeatureState(table, "filtering");
  return (
    <section class="card">
      <div class="toolbar" role="group" aria-label="Status filter">
        <For each={statuses}>
          {(status) => (
            <label class="check">
              <input
                type="checkbox"
                checked={filters().statuses.includes(status)}
                onChange={() => table.filtering.toggle("statuses", status)}
              />
              <span class={["badge", `badge-${status}`]}>{statusLabels[status]}</span>
            </label>
          )}
        </For>
        <span class="spacer" />
        <span class="muted">
          {view().matchingCount} of {rows.length}
        </span>
      </div>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <For each={headerGroups()}>
              {(group) => (
                <tr>
                  <For each={group.headers} keyed={(header) => header.id}>{(header) => <SortTh table={table} header={header()} />}</For>
                </tr>
              )}
            </For>
          </thead>
          <tbody>
            <For each={view().rows}>
              {(row) => (
                <tr>
                  <For each={columns()} keyed={(column) => column.id}>
                    {(column) => (
                      <td>
                        <Cell table={table} row={row} column={column()} />
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
