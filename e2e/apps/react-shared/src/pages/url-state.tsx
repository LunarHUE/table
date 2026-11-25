import { pageText, people, type Person, selectedText, testIds, urlAdapter, urlStateTable } from "@lunarhue/table-e2e/contract";
import {
  type Row,
  type TableStore,
  useFeatureState,
  usePagination,
  useRowState,
  useSelection,
  useTable,
  useTableBinding,
  useTableRows,
  useVisibleColumns,
} from "@lunarhue/table-react";
import { useMemo } from "react";
import { DataCells, type PageProps, Pager, Probe, SortHeader, usePageLocation, useSearch } from "../parts.js";

interface RowCheckboxProps {
  readonly table: TableStore<typeof urlStateTable>;
  readonly row: Row<Person>;
}

function RowCheckbox({ table, row }: RowCheckboxProps) {
  const checked = useRowState(table, row.id, "selection") === true;
  return (
    <input
      type="checkbox"
      aria-label={`Select ${row.original.name}`}
      checked={checked}
      onChange={() => table.selection.toggle(row.id)}
    />
  );
}

export function UrlStatePage({ search }: PageProps) {
  const location = usePageLocation(search);
  const current = useSearch(location);
  // Sorting, paging and the search come from the URL; selection stays with the table.
  const { bind } = useTableBinding(urlStateTable, urlAdapter, { input: current, onWrite: location.write });
  const table = useTable(urlStateTable, { bind });
  const view = useTableRows(table, people);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  const summary = useSelection(table, view);
  const filters = useFeatureState(table, "filtering");
  const sources = useMemo(() => ({ location: location.probe }), [location]);
  return (
    <>
      <div className="controls">
        <label>
          Search <input value={filters.q} onChange={(event) => table.filtering.set("q", event.target.value)} />
        </label>
        <span data-testid="selected">{selectedText(summary.count)}</span>
      </div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <th>Select</th>
            {columns.map((column) => (
              <SortHeader key={column.id} table={table} column={column} />
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} data-row-id={row.id} data-kind={row.kind}>
              <td>
                <RowCheckbox table={table} row={row} />
              </td>
              <DataCells table={table} row={row} columns={columns} />
            </tr>
          ))}
        </tbody>
      </table>
      <Pager pager={pager} text={pageText(pager.pageIndex, pager.pageCount)} />
      <Probe table={table} sources={sources} />
    </>
  );
}
