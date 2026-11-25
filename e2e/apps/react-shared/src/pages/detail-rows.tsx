import { countsText, detailRowsTable, detailText, pageText, people, testIds } from "@lunarhue/table-e2e/contract";
import { useFeatureState, usePagination, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { DataCells, Pager, PlainHeader, Probe } from "../parts.js";

/** A detail row's number, from the end of its id. */
const detailNumber = (id: string): number => Number(id.slice(id.lastIndexOf("~") + 1));

export function DetailRowsPage() {
  const table = useTable(detailRowsTable);
  const view = useTableRows(table, people);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  const expanded = useFeatureState(table, "expanding");
  return (
    <>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <th>Details</th>
            {columns.map((column) => (
              <PlainHeader key={column.id} column={column} />
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) =>
            row.kind === "detail" ? (
              <tr key={row.id} data-row-id={row.id} data-kind="detail" data-parent-id={row.parentId}>
                <td colSpan={columns.length + 1}>{detailText(row.original.name, detailNumber(row.id))}</td>
              </tr>
            ) : (
              <tr key={row.id} data-row-id={row.id} data-kind="data">
                <td>
                  <button
                    type="button"
                    aria-expanded={expanded[row.id] !== undefined}
                    onClick={() => table.expanding.toggle(row.id)}
                  >
                    Details for {row.original.name}
                  </button>
                </td>
                <DataCells table={table} row={row} columns={columns} />
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p data-testid="counts">{countsText(view.matchingCount, view.totalCount, view.pageCount ?? 0)}</p>
      <Pager pager={pager} text={pageText(pager.pageIndex, pager.pageCount)} />
      <Probe table={table} />
    </>
  );
}
