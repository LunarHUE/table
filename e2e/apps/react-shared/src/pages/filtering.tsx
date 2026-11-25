import {
  filteredText,
  filteringTable,
  isRole,
  matchText,
  people,
  roles,
  testIds,
} from "@lunarhue/table-e2e/contract";
import { useFeatureState, useIsFiltered, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { DataCells, PlainHeader, Probe } from "../parts.js";

export function FilteringPage() {
  const table = useTable(filteringTable);
  const view = useTableRows(table, people);
  const columns = useVisibleColumns(table);
  const filters = useFeatureState(table, "filtering");
  const filtered = useIsFiltered(table);
  return (
    <>
      <div className="controls">
        <label>
          Search <input value={filters.q} onChange={(event) => table.filtering.set("q", event.target.value)} />
        </label>
        <label>
          Role{" "}
          <select
            value={filters.role}
            onChange={(event) => {
              const role = event.target.value;
              if (isRole(role)) table.filtering.set("role", role);
            }}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={table.filtering.clear}>
          Clear filters
        </button>
        <button type="button" onClick={table.filtering.reset}>
          Reset filters
        </button>
      </div>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <PlainHeader key={column.id} column={column} />
            ))}
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} data-row-id={row.id} data-kind={row.kind}>
              <DataCells table={table} row={row} columns={columns} />
            </tr>
          ))}
        </tbody>
      </table>
      <p data-testid="matches">{matchText(view.matchingCount)}</p>
      <p data-testid="filtered">{filteredText(filtered)}</p>
      <Probe table={table} />
    </>
  );
}
