import { columnsRows, columnsTable, columnWidth, defaultWidth, testIds, widenBy } from "@lunarhue/table-e2e/contract";
import {
  type ColumnZone,
  columnSizeVars,
  createAllColumns,
  createTable,
  createTableRows,
  createVisibleColumns,
} from "@lunarhue/table-solid";
import { For } from "solid-js";
import { DataCells, labelOf, Probe } from "../parts.js";

const zones: readonly ColumnZone[] = ["start", "center", "end"];

const isZone = (value: string): value is ColumnZone => (zones as readonly string[]).includes(value);

export function ColumnsPage() {
  const table = createTable(columnsTable);
  const view = createTableRows(table, () => columnsRows);
  const visible = createVisibleColumns(table);
  const all = createAllColumns(table);
  const layout = table.columnLayout;
  return (
    <>
      <div class="controls">
        <button type="button" onClick={() => layout.showAll()}>
          Show all columns
        </button>
      </div>
      <ul>
        <For each={all()}>
          {(column) => (
            <li class="controls">
              <label>
                <input type="checkbox" checked={column.visible} onChange={() => layout.toggleVisible(column.id)} /> Show{" "}
                {labelOf(column)}
              </label>
              <label>
                Pin {labelOf(column)}{" "}
                <select
                  value={column.zone}
                  onChange={(event) => {
                    const zone = event.currentTarget.value;
                    if (isZone(zone)) layout.pin(column.id, zone);
                  }}
                >
                  <For each={zones}>{(zone) => <option value={zone}>{zone}</option>}</For>
                </select>
              </label>
              <button type="button" disabled={!column.visible} onClick={() => layout.moveColumn(column.id, column.order - 1)}>
                Move {labelOf(column)} left
              </button>
              <button type="button" disabled={!column.visible} onClick={() => layout.moveColumn(column.id, column.order + 1)}>
                Move {labelOf(column)} right
              </button>
              <button type="button" onClick={() => layout.setSize(column.id, (column.size ?? defaultWidth) + widenBy)}>
                Widen {labelOf(column)}
              </button>
            </li>
          )}
        </For>
      </ul>
      <div data-testid="columns-frame" style={columnSizeVars(visible())}>
        <table data-testid={testIds.table}>
          <thead>
            <tr>
              <For each={visible()}>
                {(column) => (
                  <th data-col={column.id} data-zone={column.zone} style={{ width: columnWidth(column.id) }}>
                    <span class="label">{labelOf(column)}</span>
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={view().rows}>
              {(row) => (
                <tr data-row-id={row.id} data-kind={row.kind}>
                  <DataCells table={table} row={row} columns={visible()} />
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <Probe table={table} />
    </>
  );
}
