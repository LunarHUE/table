import { a11yRows, a11yTable, openedText, testIds } from "@lunarhue/table-e2e/contract";
import { createTable, createTableRows, createVisibleColumns } from "@lunarhue/table-solid";
import { For } from "solid-js";
import { DataCells, PlainHeader, Probe } from "../parts.js";

/**
 * The same rows as the React page, with no row links or roving grid:
 * `@lunarhue/table-solid` has no a11y entry, so the a11y specs skip Solid.
 * The page is here for the server and hydration checks.
 */
export function A11yPage() {
  const table = createTable(a11yTable);
  const view = createTableRows(table, () => a11yRows);
  const columns = createVisibleColumns(table);
  return (
    <>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <For each={columns()}>{(column) => <PlainHeader column={column} />}</For>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) => (
              <tr data-row-id={row.id} data-kind={row.kind}>
                <DataCells table={table} row={row} columns={columns()} />
                <td>
                  <a href={`#${row.id}`}>View {row.original.name}</a>
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <p data-testid="opened">{openedText(undefined)}</p>
      <Probe table={table} />
    </>
  );
}
