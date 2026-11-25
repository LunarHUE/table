import { people, sortingTable, testIds } from "@lunarhue/table-e2e/contract";
import { createTable, createTableRows, createVisibleColumns, type TableStore } from "@lunarhue/table-solid";
import { For } from "solid-js";
import { DataCells, Probe, Renders, SortHeader } from "../parts.js";

function SortingGrid(props: { readonly table: TableStore<typeof sortingTable> }) {
  const view = createTableRows(props.table, () => people);
  const columns = createVisibleColumns(props.table);
  return (
    <div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <For each={columns()}>{(column) => <SortHeader table={props.table} column={column} />}</For>
          </tr>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) => (
              <tr data-row-id={row.id} data-kind={row.kind}>
                <DataCells table={props.table} row={row} columns={columns()} />
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Renders id="rows" />
    </div>
  );
}

export function SortingPage() {
  const table = createTable(sortingTable);
  return (
    <>
      <Renders id="page" />
      <SortingGrid table={table} />
      <Probe table={table} />
    </>
  );
}
