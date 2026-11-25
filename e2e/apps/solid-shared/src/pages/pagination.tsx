import { itemCounts, itemsUpTo, pageText, paginationTable, testIds } from "@lunarhue/table-e2e/contract";
import { createPagination, createTable, createTableRows, createVisibleColumns } from "@lunarhue/table-solid";
import { createMemo, createSignal, For } from "solid-js";
import { DataCells, Pager, PlainHeader, Probe } from "../parts.js";

export function PaginationPage() {
  const [count, setCount] = createSignal<number>(itemCounts.all);
  const data = createMemo(() => itemsUpTo(count()));
  const table = createTable(paginationTable);
  const view = createTableRows(table, data);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  return (
    <>
      <div class="controls">
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
            <For each={columns()}>{(column) => <PlainHeader column={column} />}</For>
          </tr>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) => (
              <tr data-row-id={row.id} data-kind={row.kind}>
                <DataCells table={table} row={row} columns={columns()} />
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Pager pager={pager} text={pageText(pager.pageIndex, pager.pageCount)} />
      <Probe table={table} />
    </>
  );
}
