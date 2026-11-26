import { Cell, defineTable, Header, useHeaderGroups, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { type Invoice, invoices } from "../data.ts";

// The smallest table: columns that read a key of the row, and `<Header>` and
// `<Cell>` with no components of their own, so they render the label and
// the value as text.
const basicTable = defineTable<Invoice>()({
  getRowId: (invoice) => invoice.id,
  columns: (col) => [
    col.key("id", { label: "Invoice" }),
    col.key("customer", { label: "Customer" }),
    col.key("owner", { label: "Owner" }),
    col.key("status", { label: "Status" }),
    col.key("amount", { label: "Amount" }),
    col.key("issued", { label: "Issued" }),
  ],
});

const rows = invoices.slice(0, 10);

export function BasicExample() {
  const table = useTable(basicTable);
  const view = useTableRows(table, rows);
  const headerGroups = useHeaderGroups(table);
  const columns = useVisibleColumns(table);
  return (
    <section className="card">
      <div className="table-scroll">
        <table className="table">
          <thead>
            {headerGroups.map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <th key={header.id} colSpan={header.colSpan}>
                    <Header table={table} header={header} />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.id}>
                    <Cell table={table} row={row} column={column} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{view.totalCount} invoices</p>
    </section>
  );
}
