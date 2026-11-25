import { countsText, detailRowsTable, detailText, pageText, people, testIds } from "@lunarhue/table-e2e/contract";
import {
  createFeatureState,
  createPagination,
  createTable,
  createTableRows,
  createVisibleColumns,
} from "@lunarhue/table-solid";
import { For } from "solid-js";
import { DataCells, Pager, PlainHeader, Probe } from "../parts.js";

/** A detail row's number, from the end of its id. */
const detailNumber = (id: string): number => Number(id.slice(id.lastIndexOf("~") + 1));

export function DetailRowsPage() {
  const table = createTable(detailRowsTable);
  const view = createTableRows(table, () => people);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  const expanded = createFeatureState(table, "expanding");
  return (
    <>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <th>Details</th>
            <For each={columns()}>{(column) => <PlainHeader column={column} />}</For>
          </tr>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) =>
              row.kind === "detail" ? (
                <tr data-row-id={row.id} data-kind="detail" data-parent-id={row.parentId}>
                  <td colspan={columns().length + 1}>{detailText(row.original.name, detailNumber(row.id))}</td>
                </tr>
              ) : (
                <tr data-row-id={row.id} data-kind="data">
                  <td>
                    <button
                      type="button"
                      aria-expanded={expanded()[row.id] === undefined ? "false" : "true"}
                      onClick={() => table.expanding.toggle(row.id)}
                    >
                      Details for {row.original.name}
                    </button>
                  </td>
                  <DataCells table={table} row={row} columns={columns()} />
                </tr>
              )
            }
          </For>
        </tbody>
      </table>
      <p data-testid="counts">{countsText(view().matchingCount, view().totalCount, view().pageCount ?? 0)}</p>
      <Pager pager={pager} text={pageText(pager.pageIndex, pager.pageCount)} />
      <Probe table={table} />
    </>
  );
}
