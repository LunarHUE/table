import { people, sortingTable, testIds } from "@lunarhue/table-e2e/contract";
import { type TableStore, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { DataCells, Probe, Renders, SortHeader } from "../parts.js";

interface GridProps {
  readonly table: TableStore<typeof sortingTable>;
}

function SortingGrid({ table }: GridProps) {
  const view = useTableRows(table, people);
  const columns = useVisibleColumns(table);
  return (
    <div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <SortHeader key={column.id} table={table} column={column} />
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} data-row-id={row.id} data-kind={row.kind}>
              <DataCells table={table} row={row} columns={columns} />
            </tr>
          ))}
        </tbody>
      </table>
      <Renders id="rows" />
    </div>
  );
}

export function SortingPage() {
  const table = useTable(sortingTable);
  return (
    <>
      <Renders id="page" />
      <SortingGrid table={table} />
      <Probe table={table} />
    </>
  );
}
