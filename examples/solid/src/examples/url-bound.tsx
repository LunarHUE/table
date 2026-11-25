import {
  Cell,
  type CellApi,
  columnLayout,
  createAllColumns,
  createColumnState,
  createFeatureState,
  createPagination,
  createRowState,
  createSelection,
  createTable,
  createTableBinding,
  createTableRequest,
  createTableRows,
  createVisibleColumns,
  defineStateAdapter,
  defineTable,
  type PaginationRequest,
  remoteFiltering,
  remotePagination,
  remoteSorting,
  type Row,
  selection,
  type SortingState,
  type TableStore,
} from "@lunarhue/table-solid";
import { createMemo, For, Show } from "solid-js";
import type { ViewProps } from "../app.tsx";
import { formatMoney, type Invoice, invoices, isStatus, type Status, statuses, statusLabels } from "../data.ts";
import { navigate } from "../location.ts";

// Two owners share one table. The address bar owns the sort, the filters and
// the page: the adapter reads them from the query string and writes each
// change back as one history entry, so back and forward step through them.
// The table keeps selection and column layout to itself.
//
// The remote features leave the rows alone and put their state in the
// request instead. `queryInvoices` plays the server.

interface UrlFilters {
  readonly q: string;
  readonly status: "all" | Status;
}

function AmountCell(props: { readonly cell: CellApi<number, Invoice> }) {
  return <span class="num">{formatMoney(props.cell.value)}</span>;
}

function StatusCell(props: { readonly cell: CellApi<Status, Invoice> }) {
  return <span class={["badge", `badge-${props.cell.value}`]}>{statusLabels[props.cell.value]}</span>;
}

const sizes = [5, 10, 20];

const urlTable = defineTable<Invoice>()({
  getRowId: (invoice) => invoice.id,
  columns: (col) => [
    col.key("id", { label: "Invoice", sortable: true }),
    col.key("customer", { label: "Customer", sortable: true }),
    col.key("owner", { label: "Owner" }),
    col.key("status", { label: "Status", sortable: true, cell: StatusCell }),
    col.key("amount", { label: "Amount", sortable: true, cell: AmountCell }),
  ],
  features: [
    remoteSorting(),
    remoteFiltering<UrlFilters>({ initial: { q: "", status: "all" } }),
    remotePagination({ sizes }),
    selection(),
    columnLayout(),
  ],
  initialState: { pagination: { pageIndex: 0, pageSize: 5 } },
});

const sortable = new Set(["id", "customer", "status", "amount"]);

const parseSort = (value: string | null): SortingState =>
  (value ?? "")
    .split(",")
    .map((part) => part.split("."))
    .filter(([id]) => id !== undefined && sortable.has(id))
    .map(([id = "", dir]) => ({ id, desc: dir === "desc" }));

const positive = (value: string | null): number | undefined => {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n >= 1 ? n : undefined;
};

/**
 * `?sort=amount.desc,customer.asc&status=overdue&q=acme&page=2&size=10`.
 * Pages count from 1 in the URL, and values equal to the default are left out.
 */
const invoiceUrl = defineStateAdapter({
  features: ["sorting", "filtering", "pagination"] as const,
  parse(search: string) {
    const params = new URLSearchParams(search);
    const status = params.get("status") ?? "all";
    const size = positive(params.get("size"));
    return {
      sorting: parseSort(params.get("sort")),
      filtering: { q: params.get("q") ?? "", status: isStatus(status) ? status : "all" },
      pagination: {
        pageIndex: (positive(params.get("page")) ?? 1) - 1,
        ...(size !== undefined && sizes.includes(size) ? { pageSize: size } : {}),
      },
    };
  },
  serialize(state, defaults): string {
    const params = new URLSearchParams();
    const sort = state.sorting ?? [];
    if (sort.length > 0) params.set("sort", sort.map((entry) => `${entry.id}.${entry.desc ? "desc" : "asc"}`).join(","));
    const status = state.filtering?.["status"];
    if (typeof status === "string" && status !== "all") params.set("status", status);
    const q = state.filtering?.["q"];
    if (typeof q === "string" && q !== "") params.set("q", q);
    const page = state.pagination;
    if (page && page.pageIndex > 0) params.set("page", String(page.pageIndex + 1));
    if (page && page.pageSize !== defaults.pagination?.pageSize) params.set("size", String(page.pageSize));
    const text = params.toString();
    return text === "" ? "" : `?${text}`;
  },
});

interface InvoiceRequest {
  readonly sorting: SortingState;
  readonly filtering: UrlFilters;
  readonly pagination: PaginationRequest;
}

const compareBy = (a: Invoice, b: Invoice, id: string): number => {
  const x: unknown = Reflect.get(a, id);
  const y: unknown = Reflect.get(b, id);
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y));
};

/** What a server would do with the request: filter, sort, then cut out the page. */
function queryInvoices(request: InvoiceRequest): { readonly rows: readonly Invoice[]; readonly total: number } {
  const { q, status } = request.filtering;
  const query = q.trim().toLowerCase();
  const matching = invoices.filter(
    (invoice) =>
      (status === "all" || invoice.status === status) &&
      (query === "" || `${invoice.id} ${invoice.customer}`.toLowerCase().includes(query)),
  );
  const sorted = matching.toSorted((a, b) => {
    for (const { id, desc } of request.sorting) {
      const order = compareBy(a, b, id);
      if (order !== 0) return desc ? -order : order;
    }
    return 0;
  });
  const { pageIndex, pageSize } = request.pagination;
  return { rows: sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), total: matching.length };
}

type UrlTable = TableStore<typeof urlTable>;

const sortDirOf = (value: unknown): "asc" | "desc" | false => (value === "asc" || value === "desc" ? value : false);

const ariaSort = (dir: "asc" | "desc" | false): "ascending" | "descending" | "none" =>
  dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";

function SortTh(props: { readonly table: UrlTable; readonly id: string; readonly label: string }) {
  const dir = createColumnState(props.table, () => props.id, "sorting", sortDirOf);
  return (
    <th aria-sort={ariaSort(dir())}>
      <button type="button" class="sort" onClick={(event) => props.table.sorting.toggle(props.id, { multi: event.shiftKey })}>
        {props.label}
        <span class={["sort-icon", { active: dir() !== false }]} aria-hidden="true">
          {dir() === "asc" ? "▲" : dir() === "desc" ? "▼" : "↕"}
        </span>
      </button>
    </th>
  );
}

function RowCheckbox(props: { readonly table: UrlTable; readonly row: Row<Invoice> }) {
  const checked = createRowState(props.table, () => props.row.id, "selection", (value) => value === true);
  return (
    <input
      type="checkbox"
      aria-label={`Select ${props.row.id}`}
      checked={checked()}
      onChange={() => props.table.selection.toggle(props.row.id)}
    />
  );
}

export function UrlBoundExample(props: ViewProps) {
  const { bind } = createTableBinding(urlTable, invoiceUrl, {
    input: () => props.search,
    onWrite: (next) => navigate(`${window.location.pathname}${next}${window.location.hash}`),
  });
  const table = createTable(urlTable, () => ({ bind: bind() }));
  const request = createTableRequest(table);
  const result = createMemo(() => queryInvoices(request()));
  const view = createTableRows(
    table,
    () => result().rows,
    () => ({ totalCount: result().total }),
  );
  const columns = createVisibleColumns(table);
  const all = createAllColumns(table);
  const pager = createPagination(table, view);
  const summary = createSelection(table, view);
  const filters = createFeatureState(table, "filtering");

  return (
    <section class="card">
      <div class="toolbar">
        <input
          type="search"
          placeholder="Search invoice or customer"
          aria-label="Search"
          value={filters().q}
          onInput={(event) => table.filtering.set("q", event.currentTarget.value)}
        />
        <select
          aria-label="Status"
          value={filters().status}
          onChange={(event) => {
            const status = event.currentTarget.value;
            table.filtering.set("status", isStatus(status) ? status : "all");
          }}
        >
          <option value="all">All statuses</option>
          <For each={statuses}>{(status) => <option value={status}>{statusLabels[status]}</option>}</For>
        </select>
        <span class="spacer" />
        <span class="muted">{summary().count} selected (kept by the table)</span>
      </div>
      <div class="owners">
        <div>
          <h3>URL owns</h3>
          <code>{props.search === "" ? "(no query string)" : props.search}</code>
        </div>
        <div>
          <h3>Table owns</h3>
          <span class="chips">
            <For each={all()} keyed={(column) => column.id}>
              {(column) => (
                <label class="check">
                  <input type="checkbox" checked={column().visible} onChange={() => table.columnLayout.toggleVisible(column().id)} />
                  {column().label ?? column().id}
                </label>
              )}
            </For>
          </span>
        </div>
      </div>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th class="select">
                <span class="sr-only">Select</span>
              </th>
              <For each={columns()} keyed={(column) => column.id}>
                {(column) => (
                  <Show when={column().sortable === true} fallback={<th>{column().label ?? column().id}</th>}>
                    <SortTh table={table} id={column().id} label={column().label ?? column().id} />
                  </Show>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={view().rows}>
              {(row) => (
                <tr>
                  <td class="select">
                    <RowCheckbox table={table} row={row} />
                  </td>
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
      <div class="pager">
        <span class="muted">{view().totalCount} matching</span>
        <span class="spacer" />
        <label>
          Rows per page{" "}
          <select value={String(pager.pageSize)} onChange={(event) => pager.setPageSize(Number(event.currentTarget.value))}>
            <For each={pager.sizes}>{(size) => <option value={String(size)}>{size}</option>}</For>
          </select>
        </label>
        <button type="button" onClick={() => pager.prev()} disabled={!pager.canPrev}>
          Previous
        </button>
        <span>
          Page {pager.pageCount === 0 ? 0 : pager.pageIndex + 1} of {pager.pageCount}
        </span>
        <button type="button" onClick={() => pager.next()} disabled={!pager.canNext}>
          Next
        </button>
      </div>
      <details class="request">
        <summary>Request sent to the server</summary>
        <pre>{JSON.stringify(request(), null, 2)}</pre>
      </details>
    </section>
  );
}
