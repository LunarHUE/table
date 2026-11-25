import type { ReactNode } from "react";
import {
  Cell,
  Header,
  pagination,
  useFeatureState,
  useHeaderGroups,
  useIsFiltered,
  usePagination,
  useTableRows,
  useVisibleColumns,
  type Table,
} from "../index.js";
import { track } from "./fixtures.js";

type Pagination = ReturnType<typeof pagination>;

interface DataTableProps<TRow> {
  readonly table: Table<TRow, readonly [Pagination]>;
  readonly data: readonly TRow[];
  readonly children?: ReactNode;
}

/**
 * A generic table component, as an app's design system would write one. It
 * takes any table with pagination and calls the feature hooks whether or not
 * the table has the feature.
 */
export function DataTable<TRow>({ table, data, children }: DataTableProps<TRow>) {
  const view = useTableRows(table, data);
  const headerGroups = useHeaderGroups(table);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  const filtered = useIsFiltered(table);
  const filters = useFeatureState(table, "filtering");
  track("table");
  return (
    <div>
      <table>
        <thead>
          {headerGroups.map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} colSpan={header.colSpan}>
                  <Header table={table} header={header} rows={view.rows} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} data-testid={`row-${row.id}`}>
              {columns.map((column) => (
                <td key={column.id}>
                  <Cell table={table} row={row} column={column} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        page {pager.pageIndex + 1} of {pager.pageCount}, {view.totalCount} rows
        {filtered ? ", filtered" : ""}
        {filters === undefined ? ", no filtering" : ""}
      </p>
      <button type="button" onClick={pager.prev} disabled={!pager.canPrev}>
        prev
      </button>
      <button type="button" onClick={pager.next} disabled={!pager.canNext}>
        next
      </button>
      {children}
    </div>
  );
}
