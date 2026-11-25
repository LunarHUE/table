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
  createPagination,
  createRowState,
  createSelectAll,
  createSelection,
  createTable,
  createTableBinding,
  createTableRows,
  createVisibleColumns,
  type Row,
  type TableStore,
} from "@lunarhue/table-solid";
import { createEffect, For } from "solid-js";
import { createSearch, DataCells, type PageProps, Pager, PlainHeader, Probe } from "../parts.js";

function RowCheckbox(props: { readonly table: TableStore<typeof selectionTable>; readonly row: Row<Person> }) {
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

export function SelectionPage(props: PageProps) {
  const { location, current } = createSearch(props.search);
  const { bind } = createTableBinding(selectionTable, roleAdapter, { input: current, onWrite: location.write });
  const table = createTable(selectionTable, () => ({ bind: bind() }));
  const view = createTableRows(table, () => people);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  const summary = createSelection(table, view);
  const page = createSelectAll(table, () => view().rows);
  let selectPage: HTMLInputElement | undefined;
  // The DOM has no attribute for `indeterminate`, so the effect sets the property.
  createEffect(
    () => page().indeterminate,
    (indeterminate) => {
      if (selectPage) selectPage.indeterminate = indeterminate;
    },
  );
  return (
    <>
      <nav class="controls">
        <For each={roleLinks}>
          {(link) => (
            <a
              href={link.search === "" ? "/selection" : link.search}
              onClick={(event) => {
                event.preventDefault();
                location.navigate(link.search);
              }}
            >
              {link.label}
            </a>
          )}
        </For>
      </nav>
      <div class="controls">
        <button type="button" onClick={() => table.selection.selectAllMatching()}>
          Select all matching
        </button>
        <button type="button" onClick={() => table.selection.clear()}>
          Clear selection
        </button>
        <span data-testid="selected">{selectedText(summary().count)}</span>
      </div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            <th>
              <input
                ref={(input) => {
                  selectPage = input;
                }}
                type="checkbox"
                aria-label="Select page"
                aria-checked={page().indeterminate ? "mixed" : page().checked ? "true" : "false"}
                checked={page().checked}
                onChange={() => page().toggle()}
              />
            </th>
            <For each={columns()}>{(column) => <PlainHeader column={column} />}</For>
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
