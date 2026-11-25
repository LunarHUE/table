import {
  Cell,
  type CellApi,
  columnLayout,
  type ColumnView,
  type ColumnViewInfo,
  type ColumnZone,
  columnSizeVars,
  createAllColumns,
  createColumnState,
  createFeatureState,
  createHeaderGroups,
  createIsFiltered,
  createPagination,
  createRowState,
  createSelectAll,
  createSelection,
  createTable,
  createTableRows,
  createVisibleColumns,
  defineTable,
  filtering,
  Footer,
  type FooterApi,
  hasFeature,
  Header,
  type HeaderApi,
  type HeaderCell,
  isRowSelected,
  pagination,
  type Row,
  type SelectionState,
  selection,
  sorting,
  type TableStore,
} from "@lunarhue/table-solid";
import { createContext, createEffect, createMemo, createSignal, For, Show, useContext } from "solid-js";
import type { ViewProps } from "../app.tsx";
import { formatDate, formatMoney, type Invoice, invoices, type Status, statuses, statusLabels } from "../data.ts";
import { navigate } from "../location.ts";

// The full table: every cell, header and footer below is a plain component
// the column names, and the page around it wires up each feature. Components
// read `props.x` and never destructure, so each read stays reactive.

type StatusFilter = "all" | "unpaid" | Status;

interface InvoiceFilters {
  readonly q: string;
  readonly status: StatusFilter;
}

const statusFilters: readonly StatusFilter[] = ["all", "unpaid", ...statuses];

const isStatusFilter = (value: string): value is StatusFilter => (statusFilters as readonly string[]).includes(value);

const filterLabel = (filter: StatusFilter): string =>
  filter === "all" ? "All statuses" : filter === "unpaid" ? "Unpaid" : statusLabels[filter];

const matchesInvoice = (invoice: Invoice, filters: InvoiceFilters): boolean => {
  const { status } = filters;
  const statusOk =
    status === "all" || (status === "unpaid" ? invoice.status === "pending" || invoice.status === "overdue" : invoice.status === status);
  const q = filters.q.trim().toLowerCase();
  return statusOk && (q === "" || `${invoice.id} ${invoice.customer} ${invoice.owner}`.toLowerCase().includes(q));
};

/** The width a column gets before anyone resizes it. */
const defaultWidth = 140;
const minWidth = 72;

// Starts on unpaid invoices. "Clear" shows every invoice, "Reset" goes back
// to unpaid, and `createIsFiltered` is true whenever the filters differ from
// where the table started.
const invoicesTable = defineTable<Invoice>()({
  getRowId: (invoice) => invoice.id,
  columns: (col) => [
    col.key("id", { label: "Invoice", sortable: true, header: ColumnHeader, cell: InvoiceLinkCell }),
    col.key("customer", { label: "Customer", sortable: true, header: ColumnHeader, footer: CountFooter }),
    col.key("owner", { label: "Owner", sortable: true, header: ColumnHeader }),
    col.key("status", { label: "Status", sortable: true, header: ColumnHeader, cell: StatusCell }),
    col.key("issued", { label: "Issued", sortable: true, header: ColumnHeader, cell: DateCell }),
    col.key("amount", { label: "Amount", sortable: true, header: ColumnHeader, cell: AmountCell, footer: TotalFooter }),
    col.custom("actions", { label: "Actions", header: ColumnHeader, cell: ActionsCell }),
  ],
  features: [
    sorting(),
    filtering<InvoiceFilters, Invoice>({
      initial: { q: "", status: "unpaid" },
      empty: { q: "", status: "all" },
      rows: matchesInvoice,
    }),
    pagination({ sizes: [5, 10, 25] }),
    selection(),
    columnLayout(),
  ],
  initialState: {
    pagination: { pageIndex: 0, pageSize: 10 },
    columnLayout: {
      hidden: [],
      order: [],
      pinned: { start: ["id"], end: ["actions"] },
      sizes: { id: 120, customer: 200, owner: 170, status: 120, issued: 130, amount: 130, actions: 170 },
    },
  },
});

type InvoiceTable = TableStore<typeof invoicesTable>;

/** What the row action buttons do. The page owns the data, so it provides them. */
interface InvoiceActions {
  readonly markPaid: (id: string) => void;
  readonly remove: (id: string) => void;
}

const InvoiceActionsContext = createContext<InvoiceActions>();

// Cells. Each gets one prop, `cell`, typed with the column's value.

function InvoiceLinkCell(props: { readonly cell: CellApi<string, Invoice> }) {
  return (
    <a class="mono" href={`#general/${props.cell.value}`}>
      {props.cell.value}
    </a>
  );
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

function ActionsCell(props: { readonly cell: CellApi<undefined, Invoice> }) {
  const actions = useContext(InvoiceActionsContext);
  return (
    <span class="row-actions">
      <button
        type="button"
        class="small"
        disabled={props.cell.row.original.status === "paid"}
        onClick={() => actions.markPaid(props.cell.row.id)}
      >
        Mark paid
      </button>
      <button type="button" class="small danger" onClick={() => actions.remove(props.cell.row.id)}>
        Delete
      </button>
    </span>
  );
}

// Footers sum up the rows on the page.

function CountFooter(props: { readonly footer: FooterApi<string, Invoice> }) {
  return <span class="muted">{props.footer.values.length} on this page</span>;
}

function TotalFooter(props: { readonly footer: FooterApi<number, Invoice> }) {
  const total = createMemo(() => props.footer.values.reduce((sum, amount) => sum + amount, 0));
  return <strong class="num">{formatMoney(total())}</strong>;
}

// Headers sort on click, add a column to the sort on shift-click, and
// resize from the handle on their right edge.

const sortDirOf = (value: unknown): "asc" | "desc" | false => (value === "asc" || value === "desc" ? value : false);

const sortIcon = (dir: "asc" | "desc" | false): string => (dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕");

function ColumnHeader(props: { readonly header: HeaderApi<Invoice> }) {
  const dir = createColumnState(props.header.table, () => props.header.header.id, "sorting", sortDirOf);
  return (
    <Show when={props.header.column} fallback={props.header.header.label}>
      {(column) => (
        <div class="th-inner">
          <Show when={column().sortable === true} fallback={<span>{column().label ?? column().id}</span>}>
            <button
              type="button"
              class="sort"
              title="Click to sort. Shift-click to sort by this column too."
              onClick={(event) => {
                const table = props.header.table;
                if (hasFeature(table, sorting)) table.sorting.toggle(column().id, { multi: event.shiftKey });
              }}
            >
              {column().label ?? column().id}
              <span class={["sort-icon", { active: dir() !== false }]} aria-hidden="true">
                {sortIcon(dir())}
              </span>
            </button>
          </Show>
          <ResizeHandle
            label={column().label ?? column().id}
            width={column().size ?? defaultWidth}
            onResize={(width) => {
              const table = props.header.table;
              if (hasFeature(table, columnLayout)) table.columnLayout.setSize(column().id, width);
            }}
          />
        </div>
      )}
    </Show>
  );
}

interface ResizeHandleProps {
  readonly label: string;
  readonly width: number;
  readonly onResize: (width: number) => void;
}

const clampWidth = (next: number): number => Math.max(minWidth, Math.round(next));

/** Drag it, or focus it and press the arrow keys. */
function ResizeHandle(props: ResizeHandleProps) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${props.label}`}
      aria-valuenow={props.width}
      aria-valuemin={minWidth}
      tabindex={0}
      class="resize"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") props.onResize(clampWidth(props.width - 16));
        if (event.key === "ArrowRight") props.onResize(clampWidth(props.width + 16));
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const handle = event.currentTarget;
        const startX = event.clientX;
        const start = props.width;
        handle.setPointerCapture(event.pointerId);
        const move = (moved: PointerEvent): void => props.onResize(clampWidth(start + moved.clientX - startX));
        const stop = (): void => {
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", stop);
          handle.removeEventListener("pointercancel", stop);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", stop);
        handle.addEventListener("pointercancel", stop);
      }}
    />
  );
}

// Pinned columns stick to the table's edges. Every width is a CSS variable
// from `columnSizeVars`, so the offsets are `calc()`s of those variables and
// a resize restyles the container alone.

const widthOf = (id: string): string => `var(--col-${id}-size, ${String(defaultWidth)}px)`;

const sum = (parts: readonly string[]): string => (parts.length === 0 ? "0px" : `calc(${parts.join(" + ")})`);

function cellStyle(columns: readonly ColumnViewInfo[], column: ColumnViewInfo): Readonly<Record<string, string>> {
  const width = widthOf(column.id);
  if (column.zone === "start") {
    const before = columns.filter((other) => other.zone === "start" && other.order < column.order);
    return { width, left: sum(["var(--select-width)", ...before.map((other) => widthOf(other.id))]) };
  }
  if (column.zone === "end") {
    const after = columns.filter((other) => other.zone === "end" && other.order > column.order);
    return { width, right: sum(after.map((other) => widthOf(other.id))) };
  }
  return { width };
}

const zones: readonly ColumnZone[] = ["start", "center", "end"];

const isZone = (value: string): value is ColumnZone => (zones as readonly string[]).includes(value);

const zoneLabels: Readonly<Record<ColumnZone, string>> = { start: "Pin left", center: "Not pinned", end: "Pin right" };

interface TableProps {
  readonly table: InvoiceTable;
}

function ColumnsMenu(props: TableProps) {
  const all = createAllColumns(props.table);
  return (
    <details class="menu">
      <summary>Columns</summary>
      <div class="menu-panel">
        <ul>
          <For each={all()} keyed={(column) => column.id}>
            {(column) => (
              <li>
                <label class="check">
                  <input
                    type="checkbox"
                    checked={column().visible}
                    onChange={() => props.table.columnLayout.toggleVisible(column().id)}
                  />
                  {column().label ?? column().id}
                </label>
                <select
                  aria-label={`Pin ${column().label ?? column().id}`}
                  value={column().zone}
                  onChange={(event) => {
                    const zone = event.currentTarget.value;
                    if (isZone(zone)) props.table.columnLayout.pin(column().id, zone);
                  }}
                >
                  <For each={zones}>{(zone) => <option value={zone}>{zoneLabels[zone]}</option>}</For>
                </select>
                <span class="move">
                  <button
                    type="button"
                    class="small"
                    aria-label={`Move ${column().label ?? column().id} left`}
                    disabled={!column().visible}
                    onClick={() => props.table.columnLayout.moveColumn(column().id, column().order - 1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    class="small"
                    aria-label={`Move ${column().label ?? column().id} right`}
                    disabled={!column().visible}
                    onClick={() => props.table.columnLayout.moveColumn(column().id, column().order + 1)}
                  >
                    →
                  </button>
                </span>
              </li>
            )}
          </For>
        </ul>
        <button type="button" class="small" onClick={() => props.table.columnLayout.reset()}>
          Reset layout
        </button>
      </div>
    </details>
  );
}

function Toolbar(props: TableProps) {
  const filters = createFeatureState(props.table, "filtering");
  const filtered = createIsFiltered(props.table);
  return (
    <div class="toolbar">
      <input
        type="search"
        placeholder="Search invoice, customer or owner"
        aria-label="Search"
        value={filters().q}
        onInput={(event) => props.table.filtering.set("q", event.currentTarget.value)}
      />
      <select
        aria-label="Status"
        value={filters().status}
        onChange={(event) => {
          const status = event.currentTarget.value;
          if (isStatusFilter(status)) props.table.filtering.set("status", status);
        }}
      >
        <For each={statusFilters}>{(filter) => <option value={filter}>{filterLabel(filter)}</option>}</For>
      </select>
      <button type="button" onClick={() => props.table.filtering.clear()}>
        Clear filters
      </button>
      <button type="button" onClick={() => props.table.filtering.reset()} disabled={!filtered()}>
        Reset
      </button>
      <Show when={filtered()}>
        <span class="pill">Filtered</span>
      </Show>
      <span class="spacer" />
      <ColumnsMenu table={props.table} />
    </div>
  );
}

/** Whether an event came from a control inside the row, which handles its own clicks and keys. */
const fromControl = (event: Event & { readonly currentTarget: Element }): boolean => {
  const hit = event.target instanceof Element ? event.target.closest("a, button, input, select, label, [role='separator']") : null;
  return hit !== null && event.currentTarget.contains(hit);
};

interface InvoiceRowProps {
  readonly table: InvoiceTable;
  readonly row: Row<Invoice>;
  readonly columns: readonly ColumnView<Invoice>[];
  readonly open: boolean;
}

/**
 * A row that opens its invoice on a click anywhere, or on Enter or Space.
 * Clicks on the checkbox, the link and the buttons are left to them. Each
 * row reads only its own selection, so checking one row updates one row.
 */
function InvoiceRow(props: InvoiceRowProps) {
  const selected = createRowState(props.table, () => props.row.id, "selection", (value) => value === true);
  const open = (): void => navigate(`#general/${props.row.id}`);
  return (
    <tr
      tabindex={0}
      class={{ open: props.open }}
      aria-selected={selected() ? "true" : "false"}
      onClick={(event) => {
        if (!fromControl(event)) open();
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !fromControl(event)) {
          event.preventDefault();
          open();
        }
      }}
    >
      <td class="select" data-zone="start">
        <input
          type="checkbox"
          aria-label={`Select ${props.row.id}`}
          checked={selected()}
          onChange={() => props.table.selection.toggle(props.row.id)}
        />
      </td>
      <For each={props.columns} keyed={(column) => column.id}>
        {(column) => (
          <td data-zone={column().zone} style={cellStyle(props.columns, column())}>
            <Cell table={props.table} row={props.row} column={column()} />
          </td>
        )}
      </For>
    </tr>
  );
}

interface HeaderThProps {
  readonly table: InvoiceTable;
  readonly header: HeaderCell<Invoice>;
  readonly rows: readonly Row<Invoice>[];
  readonly columns: readonly ColumnViewInfo[];
}

const ariaSort = (dir: "asc" | "desc" | false): "ascending" | "descending" | "none" =>
  dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";

/** The `<th>` around a header: `aria-sort` goes here, not on the button inside. */
function HeaderTh(props: HeaderThProps) {
  const dir = createColumnState(props.table, () => props.header.columnId ?? props.header.id, "sorting", sortDirOf);
  return (
    <th
      colspan={props.header.colSpan}
      data-zone={props.header.column?.zone}
      style={props.header.column ? cellStyle(props.columns, props.header.column) : undefined}
      aria-sort={props.header.column?.sortable === true ? ariaSort(dir()) : undefined}
    >
      <Header table={props.table} header={props.header} rows={props.rows} />
    </th>
  );
}

/** Whether the bulk delete removes an invoice: listed ids, or every matching invoice except some. */
const isDoomed = (invoice: Invoice, state: SelectionState, filters: InvoiceFilters): boolean =>
  isRowSelected(state, invoice.id) && (state.mode === "ids" || matchesInvoice(invoice, filters));

export function GeneralExample(props: ViewProps) {
  const [data, setData] = createSignal<readonly Invoice[]>(invoices);
  const table = createTable(invoicesTable);
  const view = createTableRows(table, data);
  const headerGroups = createHeaderGroups(table);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  const page = createSelectAll(table, () => view().rows);
  const summary = createSelection(table, view);
  const selectionState = createFeatureState(table, "selection");
  const filters = createFeatureState(table, "filtering");
  const openId = createMemo(() => props.hash.split("/")[1]);
  const opened = createMemo(() => data().find((invoice) => invoice.id === openId()));

  const actions: InvoiceActions = {
    markPaid: (id) => setData((rows) => rows.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" } : invoice))),
    remove: (id) => setData((rows) => rows.filter((invoice) => invoice.id !== id)),
  };
  const deleteSelected = (): void => {
    const state = selectionState();
    const current = filters();
    setData((rows) => rows.filter((invoice) => !isDoomed(invoice, state, current)));
    table.selection.clear();
  };

  let selectPage: HTMLInputElement | undefined;
  // `indeterminate` is a DOM property with no attribute, so an effect sets it.
  createEffect(
    () => page().indeterminate,
    (indeterminate) => {
      if (selectPage) selectPage.indeterminate = indeterminate;
    },
  );

  const first = (): number => (view().totalCount === 0 ? 0 : pager.pageIndex * pager.pageSize + 1);
  const last = (): number => Math.min(view().totalCount, (pager.pageIndex + 1) * pager.pageSize);

  return (
    <InvoiceActionsContext value={actions}>
      <section class="card">
        <Toolbar table={table} />
        <Show when={summary().count !== 0}>
          <div class="bulk-bar" role="status">
            <span>
              {summary().target.kind === "all"
                ? `All ${String(view().matchingCount)} matching invoices${summary().except.length > 0 ? ` except ${String(summary().except.length)}` : ""}`
                : `${String(summary().count)} selected`}
            </span>
            <Show when={summary().target.kind === "ids" && page().checked && view().matchingCount > (summary().count ?? 0)}>
              <button type="button" class="link" onClick={() => table.selection.selectAllMatching()}>
                Select all {view().matchingCount} matching
              </button>
            </Show>
            <code class="muted">{JSON.stringify(summary().target)}</code>
            <span class="spacer" />
            <button type="button" class="danger" onClick={deleteSelected}>
              Delete selected
            </button>
            <button type="button" onClick={() => table.selection.clear()}>
              Clear selection
            </button>
          </div>
        </Show>
        <div class="table-scroll" style={columnSizeVars(columns())}>
          <table class="table fixed">
            <thead>
              <For each={headerGroups()}>
                {(group) => (
                  <tr>
                    <th class="select" data-zone="start">
                      <input
                        ref={(input) => {
                          selectPage = input;
                        }}
                        type="checkbox"
                        aria-label="Select page"
                        aria-checked={page().indeterminate ? "mixed" : page().checked ? "true" : "false"}
                        checked={page().checked}
                        onChange={() => page().toggle()}
                      />
                    </th>
                    <For each={group.headers} keyed={(header) => header.id}>
                      {(header) => <HeaderTh table={table} header={header()} rows={view().rows} columns={columns()} />}
                    </For>
                  </tr>
                )}
              </For>
            </thead>
            <tbody>
              <For
                each={view().rows}
                fallback={
                  <tr>
                    <td colspan={columns().length + 1} class="empty">
                      No invoices match.
                    </td>
                  </tr>
                }
              >
                {(row) => <InvoiceRow table={table} row={row} columns={columns()} open={row.id === openId()} />}
              </For>
            </tbody>
            <tfoot>
              <tr>
                <td class="select" data-zone="start" />
                <For each={columns()} keyed={(column) => column.id}>
                  {(column) => (
                    <td data-zone={column().zone} style={cellStyle(columns(), column())}>
                      <Footer table={table} column={column()} rows={view().rows} />
                    </td>
                  )}
                </For>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="pager">
          <span class="muted">
            {first()}–{last()} of {view().totalCount}
          </span>
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
        <p class="hint">
          Go to the last page and delete its rows: the pager follows to the page before. {data().length} of {invoices.length}{" "}
          invoices left.{" "}
          <button type="button" class="link" onClick={() => setData(invoices)} disabled={data().length === invoices.length}>
            Restore all
          </button>
        </p>
      </section>
      <Show when={opened()}>{(invoice) => <DetailPanel invoice={invoice()} />}</Show>
    </InvoiceActionsContext>
  );
}

function DetailPanel(props: { readonly invoice: Invoice }) {
  return (
    <aside class="card detail" aria-label={`Invoice ${props.invoice.id}`}>
      <header>
        <h2>{props.invoice.id}</h2>
        <a href="#general">Close</a>
      </header>
      <dl>
        <dt>Customer</dt>
        <dd>{props.invoice.customer}</dd>
        <dt>Owner</dt>
        <dd>{props.invoice.owner}</dd>
        <dt>Status</dt>
        <dd>
          <span class={["badge", `badge-${props.invoice.status}`]}>{statusLabels[props.invoice.status]}</span>
        </dd>
        <dt>Issued</dt>
        <dd>{formatDate(props.invoice.issued)}</dd>
        <dt>Amount</dt>
        <dd class="num">{formatMoney(props.invoice.amount)}</dd>
      </dl>
      <p class="muted">Opened by clicking the row, or by Enter or Space on a focused row.</p>
    </aside>
  );
}
