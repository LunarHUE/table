import { pageText, people, type Person, selectedText, testIds, urlAdapter, urlStateTable } from "@lunarhue/table-e2e/contract";
import {
  createFeatureState,
  createPagination,
  createRowState,
  createSelection,
  createTable,
  createTableBinding,
  createTableRows,
  createVisibleColumns,
  type Row,
  type TableStore,
} from "@lunarhue/table-solid";
import { For } from "solid-js";
import { createSearch, DataCells, type PageProps, Pager, Probe, SortHeader } from "../parts.js";

function RowCheckbox(props: { readonly table: TableStore<typeof urlStateTable>; readonly row: Row<Person> }) {
  const checked = createRowState(props.table, () => props.row.id, "selection", (value) => value === true);
  return (
    <input
      type="checkbox"
      aria-label={`Select ${props.row.original.name}`}
      checked={checked()}
      onChange={() => props.table.selection.toggle(props.row.id)}
    />
  );
}

export function UrlStatePage(props: PageProps) {
  const { location, current } = createSearch(props.search);
  // Sorting, paging and the search come from the URL; selection stays with the table.
  const { bind } = createTableBinding(urlStateTable, urlAdapter, { input: current, onWrite: location.write });
  const table = createTable(urlStateTable, () => ({ bind: bind() }));
  const view = createTableRows(table, () => people);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  const summary = createSelection(table, view);
  const filters = createFeatureState(table, "filtering");
  return (
    <>
      <div class="controls">
        <label>
          Search <input value={filters().q} onInput={(event) => table.filtering.set("q", event.currentTarget.value)} />
        </label>
        <span data-testid="selected">{selectedText(summary().count)}</span>
      </div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <th>Select</th>
            <For each={columns()}>{(column) => <SortHeader table={table} column={column} />}</For>
          </tr>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) => (
              <tr data-row-id={row.id} data-kind={row.kind}>
                <td>
                  <RowCheckbox table={table} row={row} />
                </td>
                <DataCells table={table} row={row} columns={columns()} />
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <Pager pager={pager} text={pageText(pager.pageIndex, pager.pageCount)} />
      <Probe table={table} sources={{ location: location.probe }} />
    </>
  );
}
