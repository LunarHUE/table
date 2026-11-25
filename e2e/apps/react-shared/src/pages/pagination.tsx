import { itemCounts, itemsUpTo, pageText, paginationTable, testIds } from "@lunarhue/table-e2e/contract";
import { usePagination, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { useMemo, useState } from "react";
import { DataCells, Pager, PlainHeader, Probe } from "../parts.js";

export function PaginationPage() {
  const [count, setCount] = useState<number>(itemCounts.all);
  const data = useMemo(() => itemsUpTo(count), [count]);
  const table = useTable(paginationTable);
  const view = useTableRows(table, data);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  return (
    <>
      <div className="controls">
        <button type="button" onClick={() => setCount(itemCounts.few)}>
          Keep {itemCounts.few} rows
        </button>
        <button type="button" onClick={() => setCount(itemCounts.all)}>
          Restore all rows
        </button>
      </div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <PlainHeader key={column.id} column={column} />
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
      <Pager pager={pager} text={pageText(pager.pageIndex, pager.pageCount)} />
      <Probe table={table} />
    </>
  );
}
