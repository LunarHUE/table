import { Cell, createHeaderGroups, createTable, createTableRows, createVisibleColumns, defineTable, Header } from "@lunarhue/table-solid";
import { For } from "solid-js";
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
  const table = createTable(basicTable);
  const view = createTableRows(table, () => rows);
  const headerGroups = createHeaderGroups(table);
  const columns = createVisibleColumns(table);
  return (
    <section class="card">
      <div class="table-scroll">
        <table class="table">
          <thead>
            <For each={headerGroups()}>
              {(group) => (
                <tr>
                  <For each={group.headers} keyed={(header) => header.id}>
                    {(header) => (
                      <th colspan={header().colSpan}>
                        <Header table={table} header={header()} />
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
      <p class="muted">{view().totalCount} invoices</p>
    </section>
  );
}
