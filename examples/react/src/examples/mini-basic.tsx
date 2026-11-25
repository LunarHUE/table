import { ariaSort } from "@lunarhue/table-react/a11y";
import { type SimpleColumn, useSimpleTable } from "@lunarhue/table-react/mini";
import { type Invoice, invoices } from "../data.ts";

// `useSimpleTable` is one hook on plain React state: sort by one column, a
// search box and pages. It never imports core, so it costs about a kilobyte.
// Every cell here is the column's value as text.

const columns: readonly SimpleColumn<Invoice>[] = [
  { id: "id", label: "Invoice", sortable: true },
  { id: "customer", label: "Customer", sortable: true },
  { id: "owner", label: "Owner", sortable: true },
  { id: "status", label: "Status", sortable: true },
  { id: "amount", label: "Amount", sortable: true },
];

const textOf = (value: unknown): string => (typeof value === "string" || typeof value === "number" ? String(value) : "");

export function MiniBasicExample() {
  const table = useSimpleTable({ data: invoices, columns, pageSize: 8 });
  return (
    <section className="card">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Search"
          aria-label="Search"
          value={table.search}
          onChange={(event) => table.setSearch(event.target.value)}
        />
        <span className="muted">
          {table.filteredCount} of {table.totalCount} invoices
        </span>
      </div>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column.id} aria-sort={ariaSort(table.sortDir(column.id))}>
                  <button type="button" className="sort" onClick={() => table.toggleSort(column.id)}>
                    {column.label}
                    <span className="sort-icon" aria-hidden="true">
                      {table.sortDir(column.id) === "asc" ? "▲" : table.sortDir(column.id) === "desc" ? "▼" : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id}>
                {table.columns.map((column) => (
                  <td key={column.id}>{textOf(table.getValue(row.original, column.id))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
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
