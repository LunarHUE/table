import {
  filteredText,
  filteringTable,
  isRole,
  matchText,
  people,
  roles,
  testIds,
} from "@lunarhue/table-e2e/contract";
import {
  createFeatureState,
  createIsFiltered,
  createTable,
  createTableRows,
  createVisibleColumns,
} from "@lunarhue/table-solid";
import { For } from "solid-js";
import { DataCells, PlainHeader, Probe } from "../parts.js";

export function FilteringPage() {
  const table = createTable(filteringTable);
  const view = createTableRows(table, () => people);
  const columns = createVisibleColumns(table);
  const filters = createFeatureState(table, "filtering");
  const filtered = createIsFiltered(table);
  return (
    <>
      <div class="controls">
        <label>
          Search <input value={filters().q} onInput={(event) => table.filtering.set("q", event.currentTarget.value)} />
        </label>
        <label>
          Role{" "}
          <select
            value={filters().role}
            onChange={(event) => {
              const role = event.currentTarget.value;
              if (isRole(role)) table.filtering.set("role", role);
            }}
          >
            <For each={roles}>{(role) => <option value={role}>{role}</option>}</For>
          </select>
        </label>
        <button type="button" onClick={() => table.filtering.clear()}>
          Clear filters
        </button>
        <button type="button" onClick={() => table.filtering.reset()}>
          Reset filters
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
      <p data-testid="matches">{matchText(view().matchingCount)}</p>
      <p data-testid="filtered">{filteredText(filtered())}</p>
      <Probe table={table} />
    </>
  );
}
