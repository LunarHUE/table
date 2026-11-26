import { ariaSort, selectAllInputProps, selectInputProps } from "@lunarhue/table-react/a11y";
import { type SimpleColumn, useSimpleTable } from "@lunarhue/table-react/mini";
import { type ReactNode, useState } from "react";
import { formatDate, formatMoney, type Invoice, invoices, statusLabels } from "../data.ts";

// The mini table has no cell components. The page decides how each column
// renders, here with a map from column id to a function of the row.

const columns: readonly SimpleColumn<Invoice>[] = [
  { id: "id", label: "Invoice", sortable: true },
  { id: "customer", label: "Customer", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "issued", label: "Issued", sortable: true },
  { id: "amount", label: "Amount", sortable: true },
  { id: "actions", label: "Actions", accessor: () => null },
];

/** Searches the invoice id and the customer only. */
const filter = (invoice: Invoice, query: string): boolean =>
  invoice.id.toLowerCase().includes(query) || invoice.customer.toLowerCase().includes(query);

export function MiniCustomExample() {
  const [data, setData] = useState(invoices);
  const table = useSimpleTable({ data, columns, filter, pageSize: 8, selectable: true, initialSort: { id: "issued", desc: true } });

  const markPaid = (id: string): void =>
    setData((rows) => rows.map((invoice) => (invoice.id === id ? { ...invoice, status: "paid" } : invoice)));
  const markSelectedPaid = (): void => {
    const selected = new Set(table.selectedIds);
    setData((rows) => rows.map((invoice) => (selected.has(invoice.id) ? { ...invoice, status: "paid" } : invoice)));
    table.clearSelection();
  };

  const render: Readonly<Record<string, (invoice: Invoice) => ReactNode>> = {
    id: (invoice) => <span className="mono">{invoice.id}</span>,
    status: (invoice) => <span className={`badge badge-${invoice.status}`}>{statusLabels[invoice.status]}</span>,
    issued: (invoice) => <time dateTime={invoice.issued}>{formatDate(invoice.issued)}</time>,
    amount: (invoice) => <span className="num">{formatMoney(invoice.amount)}</span>,
    actions: (invoice) => (
      <button type="button" className="small" disabled={invoice.status === "paid"} onClick={() => markPaid(invoice.id)}>
        Mark paid
      </button>
    ),
  };

  return (
    <section className="card">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search invoice or customer"
          aria-label="Search"
          value={table.search}
          onChange={(event) => table.setSearch(event.target.value)}
        />
        <span className="spacer" />
        {table.selectedIds.length > 0 ? (
          <>
            <span>{table.selectedIds.length} selected</span>
            <button type="button" onClick={markSelectedPaid}>
              Mark selected paid
            </button>
            <button type="button" onClick={table.clearSelection}>
              Clear
            </button>
          </>
        ) : null}
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th className="select">
                <input
                  {...selectAllInputProps({
                    checked: table.allSelected,
                    indeterminate: table.indeterminate,
                    toggle: table.toggleAll,
                    label: "Select all matching",
                  })}
                />
              </th>
              {table.columns.map((column) =>
                column.sortable === true ? (
                  <th key={column.id} aria-sort={ariaSort(table.sortDir(column.id))}>
                    <button type="button" className="sort" onClick={() => table.toggleSort(column.id)}>
                      {column.label}
                      <span className="sort-icon" aria-hidden="true">
                        {table.sortDir(column.id) === "asc" ? "▲" : table.sortDir(column.id) === "desc" ? "▼" : "↕"}
                      </span>
                    </button>
                  </th>
                ) : (
                  <th key={column.id}>{column.label}</th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id} aria-selected={table.isSelected(row.id)}>
                <td className="select">
                  <input
                    {...selectInputProps({
                      checked: table.isSelected(row.id),
                      toggle: () => table.toggleRow(row.id),
                      label: `Select ${row.id}`,
                    })}
                  />
                </td>
                {table.columns.map((column) => (
                  <td key={column.id}>{render[column.id]?.(row.original) ?? String(table.getValue(row.original, column.id))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="muted">
          {table.filteredCount} of {table.totalCount} invoices
        </span>
        <span className="spacer" />
        <button type="button" onClick={table.prev} disabled={!table.canPrev}>
          Previous
        </button>
        <span>
          Page {table.pageIndex + 1} of {table.pageCount}
        </span>
        <button type="button" onClick={table.next} disabled={!table.canNext}>
          Next
        </button>
      </div>
    </section>
  );
}
