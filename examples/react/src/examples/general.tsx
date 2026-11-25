import {
  Cell,
  type CellApi,
  columnLayout,
  type ColumnViewInfo,
  type ColumnZone,
  columnSizeVars,
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
  type ColumnView,
  useAllColumns,
  useColumnState,
  useFeatureState,
  useHeaderGroups,
  useIsFiltered,
  usePagination,
  useRowState,
  useSelectAll,
  useSelection,
  useTable,
  useTableRows,
  useVisibleColumns,
} from "@lunarhue/table-react";
import { ariaSort, selectAllInputProps, selectInputProps, useRowLink } from "@lunarhue/table-react/a11y";
import { createContext, type CSSProperties, useContext, useState } from "react";
import { formatDate, formatMoney, type Invoice, invoices, type Status, statuses, statusLabels } from "../data.ts";
import { navigate, useHash } from "../location.ts";

// The full table: every cell, header and footer below is a plain component
// the column names, and the page around it wires up each feature.

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
// to unpaid, and `useIsFiltered` is true whenever the filters differ from
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

const InvoiceActionsContext = createContext<InvoiceActions>({ markPaid: () => {}, remove: () => {} });

// Cells. Each gets one prop, `cell`, typed with the column's value.

function InvoiceLinkCell({ cell }: { readonly cell: CellApi<string, Invoice> }) {
  return (
    <a className="mono" href={`#general/${cell.value}`}>
      {cell.value}
    </a>
  );
}

function StatusCell({ cell }: { readonly cell: CellApi<Status, Invoice> }) {
  return <span className={`badge badge-${cell.value}`}>{statusLabels[cell.value]}</span>;
}

function DateCell({ cell }: { readonly cell: CellApi<string, Invoice> }) {
  return <time dateTime={cell.value}>{formatDate(cell.value)}</time>;
}

function AmountCell({ cell }: { readonly cell: CellApi<number, Invoice> }) {
  return <span className="num">{formatMoney(cell.value)}</span>;
}

function ActionsCell({ cell }: { readonly cell: CellApi<undefined, Invoice> }) {
  const actions = useContext(InvoiceActionsContext);
  const invoice = cell.row.original;
  return (
    <span className="row-actions">
      <button type="button" className="small" disabled={invoice.status === "paid"} onClick={() => actions.markPaid(invoice.id)}>
        Mark paid
      </button>
      <button type="button" className="small danger" onClick={() => actions.remove(invoice.id)}>
        Delete
      </button>
    </span>
  );
}

// Footers sum up the rows on the page.

function CountFooter({ footer }: { readonly footer: FooterApi<string, Invoice> }) {
  return <span className="muted">{footer.values.length} on this page</span>;
}

function TotalFooter({ footer }: { readonly footer: FooterApi<number, Invoice> }) {
  const total = footer.values.reduce((sum, amount) => sum + amount, 0);
  return <strong className="num">{formatMoney(total)}</strong>;
}

// Headers sort on click, add a column to the sort on shift-click, and
// resize from the handle on their right edge.

const sortDirOf = (value: unknown): "asc" | "desc" | false => (value === "asc" || value === "desc" ? value : false);

const sortIcon = { asc: "▲", desc: "▼" } as const;

function ColumnHeader({ header }: { readonly header: HeaderApi<Invoice> }) {
  const { table, column } = header;
  const dir = sortDirOf(useColumnState(table, header.header.id, "sorting"));
  if (column === undefined) return header.header.label;
  const label = column.label ?? column.id;
  return (
    <div className="th-inner">
      {column.sortable === true && hasFeature(table, sorting) ? (
        <button
          type="button"
          className="sort"
          title="Click to sort. Shift-click to sort by this column too."
          onClick={(event) => table.sorting.toggle(column.id, { multi: event.shiftKey })}
        >
          {label}
          <span className={dir ? "sort-icon active" : "sort-icon"} aria-hidden="true">
            {dir ? sortIcon[dir] : "↕"}
          </span>
        </button>
      ) : (
        <span>{label}</span>
      )}
      {hasFeature(table, columnLayout) ? (
        <ResizeHandle
          label={label}
          width={column.size ?? defaultWidth}
          onResize={(width) => table.columnLayout.setSize(column.id, width)}
        />
      ) : null}
    </div>
  );
}

interface ResizeHandleProps {
  readonly label: string;
  readonly width: number;
  readonly onResize: (width: number) => void;
}

/** Drag it, or focus it and press the arrow keys. */
function ResizeHandle({ label, width, onResize }: ResizeHandleProps) {
  const clamp = (next: number): number => Math.max(minWidth, Math.round(next));
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label}`}
      aria-valuenow={width}
      aria-valuemin={minWidth}
      tabIndex={0}
      className="resize"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onResize(clamp(width - 16));
        if (event.key === "ArrowRight") onResize(clamp(width + 16));
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const handle = event.currentTarget;
        const startX = event.clientX;
        handle.setPointerCapture(event.pointerId);
        const move = (moved: PointerEvent): void => onResize(clamp(width + moved.clientX - startX));
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

function cellStyle(columns: readonly ColumnViewInfo[], column: ColumnViewInfo): CSSProperties {
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

function ColumnsMenu({ table }: TableProps) {
  const all = useAllColumns(table);
  const layout = table.columnLayout;
  return (
    <details className="menu">
      <summary>Columns</summary>
      <div className="menu-panel">
        <ul>
          {all.map((column) => {
            const label = column.label ?? column.id;
            return (
              <li key={column.id}>
                <label className="check">
                  <input type="checkbox" checked={column.visible} onChange={() => layout.toggleVisible(column.id)} />
                  {label}
                </label>
                <select
                  aria-label={`Pin ${label}`}
                  value={column.zone}
                  onChange={(event) => {
                    const zone = event.target.value;
                    if (isZone(zone)) layout.pin(column.id, zone);
                  }}
                >
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zoneLabels[zone]}
                    </option>
                  ))}
                </select>
                <span className="move">
                  <button
                    type="button"
                    className="small"
                    aria-label={`Move ${label} left`}
                    disabled={!column.visible}
                    onClick={() => layout.moveColumn(column.id, column.order - 1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="small"
                    aria-label={`Move ${label} right`}
                    disabled={!column.visible}
                    onClick={() => layout.moveColumn(column.id, column.order + 1)}
                  >
                    →
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        <button type="button" className="small" onClick={layout.reset}>
          Reset layout
        </button>
      </div>
    </details>
  );
}

function Toolbar({ table }: TableProps) {
  const filters = useFeatureState(table, "filtering");
  const filtered = useIsFiltered(table);
  return (
    <div className="toolbar">
      <input
        type="search"
        placeholder="Search invoice, customer or owner"
        aria-label="Search"
        value={filters.q}
        onChange={(event) => table.filtering.set("q", event.target.value)}
      />
      <select
        aria-label="Status"
        value={filters.status}
        onChange={(event) => {
          const status = event.target.value;
          if (isStatusFilter(status)) table.filtering.set("status", status);
        }}
      >
        {statusFilters.map((filter) => (
          <option key={filter} value={filter}>
            {filterLabel(filter)}
          </option>
        ))}
      </select>
      <button type="button" onClick={table.filtering.clear}>
        Clear filters
      </button>
      <button type="button" onClick={table.filtering.reset} disabled={!filtered}>
        Reset
      </button>
      {filtered ? <span className="pill">Filtered</span> : null}
      <span className="spacer" />
      <ColumnsMenu table={table} />
    </div>
  );
}

interface InvoiceRowProps {
  readonly table: InvoiceTable;
  readonly row: Row<Invoice>;
  readonly columns: readonly ColumnView<Invoice>[];
  readonly open: boolean;
}

/**
 * A row that opens its invoice on a click anywhere, or on Enter or Space.
 * `useRowLink` leaves clicks on the checkbox, the link and the buttons alone.
 * Each row reads only its own selection, so checking one row renders one row.
 */
function InvoiceRow({ table, row, columns, open }: InvoiceRowProps) {
  const selected = useRowState(table, row.id, "selection") === true;
  const link = useRowLink(() => navigate(`#general/${row.id}`));
  return (
    <tr {...link} className={open ? "open" : undefined} aria-selected={selected}>
      <td className="select" data-zone="start">
        <input {...selectInputProps({ checked: selected, toggle: () => table.selection.toggle(row.id), label: `Select ${row.id}` })} />
      </td>
      {columns.map((column) => (
        <td key={column.id} data-zone={column.zone} style={cellStyle(columns, column)}>
          <Cell table={table} row={row} column={column} />
        </td>
      ))}
    </tr>
  );
}

/** Whether the bulk delete removes an invoice: listed ids, or every matching invoice except some. */
const isDoomed = (invoice: Invoice, state: SelectionState, filters: InvoiceFilters): boolean =>
  isRowSelected(state, invoice.id) && (state.mode === "ids" || matchesInvoice(invoice, filters));

export function GeneralExample() {
  const [data, setData] = useState(invoices);
  const table = useTable(invoicesTable);
  const view = useTableRows(table, data);
  const headerGroups = useHeaderGroups(table);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  const page = useSelectAll(table, view.rows);
  const summary = useSelection(table, view);
  const selectionState = useFeatureState(table, "selection");
  const filters = useFeatureState(table, "filtering");
  const openId = useHash().split("/")[1];
  const opened = data.find((invoice) => invoice.id === openId);

  const actions: InvoiceActions = {
    markPaid: (id) => setData((rows) => rows.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" } : invoice))),
    remove: (id) => setData((rows) => rows.filter((invoice) => invoice.id !== id)),
  };
  const deleteSelected = (): void => {
    setData((rows) => rows.filter((invoice) => !isDoomed(invoice, selectionState, filters)));
    table.selection.clear();
  };

  const first = view.totalCount === 0 ? 0 : pager.pageIndex * pager.pageSize + 1;
  const last = Math.min(view.totalCount, (pager.pageIndex + 1) * pager.pageSize);
  // React leaves `--*` custom properties out of CSSProperties, but sets them.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const sizeVars = columnSizeVars(columns) as CSSProperties;

  return (
    <InvoiceActionsContext value={actions}>
      <section className="card">
        <Toolbar table={table} />
        {summary.count !== 0 ? (
          <div className="bulk-bar" role="status">
            <span>
              {summary.target.kind === "all"
                ? `All ${String(view.matchingCount)} matching invoices${summary.except.length > 0 ? ` except ${String(summary.except.length)}` : ""}`
                : `${String(summary.count)} selected`}
            </span>
            {summary.target.kind === "ids" && page.checked && view.matchingCount > (summary.count ?? 0) ? (
              <button type="button" className="link" onClick={table.selection.selectAllMatching}>
                Select all {view.matchingCount} matching
              </button>
            ) : null}
            <code className="muted">{JSON.stringify(summary.target)}</code>
            <span className="spacer" />
            <button type="button" className="danger" onClick={deleteSelected}>
              Delete selected
            </button>
            <button type="button" onClick={table.selection.clear}>
              Clear selection
            </button>
          </div>
        ) : null}
        <div className="table-scroll" style={sizeVars}>
          <table className="table fixed">
            <thead>
              {headerGroups.map((group) => (
                <tr key={group.id}>
                  <th className="select" data-zone="start">
                    <input
                      {...selectAllInputProps({
                        checked: page.checked,
                        indeterminate: page.indeterminate,
                        toggle: page.toggle,
                        label: "Select page",
                      })}
                    />
                  </th>
                  {group.headers.map((header) => (
                    <HeaderTh key={header.id} table={table} header={header} rows={view.rows} columns={columns} />
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {view.rows.map((row) => (
                <InvoiceRow key={row.id} table={table} row={row} columns={columns} open={row.id === openId} />
              ))}
              {view.rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="empty">
                    No invoices match.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr>
                <td className="select" data-zone="start" />
                {columns.map((column) => (
                  <td key={column.id} data-zone={column.zone} style={cellStyle(columns, column)}>
                    <Footer table={table} column={column} rows={view.rows} />
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="pager">
          <span className="muted">
            {first}–{last} of {view.totalCount}
          </span>
          <span className="spacer" />
          <label>
            Rows per page{" "}
            <select value={pager.pageSize} onChange={(event) => pager.setPageSize(Number(event.target.value))}>
              {pager.sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={pager.prev} disabled={!pager.canPrev}>
            Previous
          </button>
          <span>
            Page {pager.pageCount === 0 ? 0 : pager.pageIndex + 1} of {pager.pageCount}
          </span>
          <button type="button" onClick={pager.next} disabled={!pager.canNext}>
            Next
          </button>
        </div>
        <p className="hint">
          Go to the last page and delete its rows: the pager follows to the page before. {data.length} of {invoices.length} invoices
          left.{" "}
          <button type="button" className="link" onClick={() => setData(invoices)} disabled={data.length === invoices.length}>
            Restore all
          </button>
        </p>
      </section>
      {opened ? <DetailPanel invoice={opened} /> : null}
    </InvoiceActionsContext>
  );
}

interface HeaderThProps {
  readonly table: InvoiceTable;
  readonly header: HeaderCell<Invoice>;
  readonly rows: readonly Row<Invoice>[];
  readonly columns: readonly ColumnViewInfo[];
}

/** The `<th>` around a header: `aria-sort` goes here, not on the button inside. */
function HeaderTh({ table, header, rows, columns }: HeaderThProps) {
  const dir = sortDirOf(useColumnState(table, header.columnId ?? header.id, "sorting"));
  const column = header.column;
  return (
    <th
      colSpan={header.colSpan}
      data-zone={column?.zone}
      style={column ? cellStyle(columns, column) : undefined}
      aria-sort={column?.sortable === true ? ariaSort(dir) : undefined}
    >
      <Header table={table} header={header} rows={rows} />
    </th>
  );
}

function DetailPanel({ invoice }: { readonly invoice: Invoice }) {
  return (
    <aside className="card detail" aria-label={`Invoice ${invoice.id}`}>
      <header>
        <h2>{invoice.id}</h2>
        <a href="#general">Close</a>
      </header>
      <dl>
        <dt>Customer</dt>
        <dd>{invoice.customer}</dd>
        <dt>Owner</dt>
        <dd>{invoice.owner}</dd>
        <dt>Status</dt>
        <dd>
          <span className={`badge badge-${invoice.status}`}>{statusLabels[invoice.status]}</span>
        </dd>
        <dt>Issued</dt>
        <dd>{formatDate(invoice.issued)}</dd>
        <dt>Amount</dt>
        <dd className="num">{formatMoney(invoice.amount)}</dd>
      </dl>
      <p className="muted">Opened by clicking the row, or by Enter or Space on a focused row.</p>
    </aside>
  );
}

