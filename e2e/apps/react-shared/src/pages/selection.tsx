import {
  pageText,
  people,
  type Person,
  roleAdapter,
  roleLinks,
  selectedText,
  selectionTable,
  testIds,
} from "@lunarhue/table-e2e/contract";
import {
  type Row,
  type TableStore,
  usePagination,
  useRowState,
  useSelectAll,
  useSelection,
  useTable,
  useTableBinding,
  useTableRows,
  useVisibleColumns,
} from "@lunarhue/table-react";
import { selectAllInputProps, selectInputProps } from "@lunarhue/table-react/a11y";
import { useMemo } from "react";
import { DataCells, type PageProps, Pager, PlainHeader, Probe, usePageLocation, useSearch } from "../parts.js";

interface RowCheckboxProps {
  readonly table: TableStore<typeof selectionTable>;
  readonly row: Row<Person>;
}

function RowCheckbox({ table, row }: RowCheckboxProps) {
  const checked = useRowState(table, row.id, "selection") === true;
  return (
    <input
      {...selectInputProps({ checked, toggle: () => table.selection.toggle(row.id), label: `Select ${row.original.name}` })}
    />
  );
}

export function SelectionPage({ search }: PageProps) {
  const location = usePageLocation(search);
  const current = useSearch(location);
  const { bind } = useTableBinding(selectionTable, roleAdapter, { input: current, onWrite: location.write });
  const table = useTable(selectionTable, { bind });
  const view = useTableRows(table, people);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);
  const summary = useSelection(table, view);
  const page = useSelectAll(table, view.rows);
  const sources = useMemo(() => ({ location: location.probe }), [location]);
  return (
    <>
      <nav className="controls">
        {roleLinks.map((link) => (
          <a
            key={link.label}
            href={link.search === "" ? "/selection" : link.search}
            onClick={(event) => {
              event.preventDefault();
              location.navigate(link.search);
            }}
          >
            {link.label}
          </a>
        ))}
      </nav>
      <div className="controls">
        <button type="button" onClick={table.selection.selectAllMatching}>
          Select all matching
        </button>
        <button type="button" onClick={table.selection.clear}>
          Clear selection
        </button>
        <span data-testid="selected">{selectedText(summary.count)}</span>
      </div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <th>
              <input
                {...selectAllInputProps({
                  checked: page.checked,
                  indeterminate: page.indeterminate,
                  toggle: page.toggle,
                  label: "Select page",
                })}
              />
            </th>
            {columns.map((column) => (
              <PlainHeader key={column.id} column={column} />
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
