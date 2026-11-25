import { type ColumnZone, columnSizeVars, useAllColumns, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { columnsRows, columnsTable, columnWidth, defaultWidth, testIds, widenBy } from "@lunarhue/table-e2e/contract";
import type { CSSProperties } from "react";
import { DataCells, labelOf, Probe } from "../parts.js";

const zones: readonly ColumnZone[] = ["start", "center", "end"];

const isZone = (value: string): value is ColumnZone => (zones as readonly string[]).includes(value);

export function ColumnsPage() {
  const table = useTable(columnsTable);
  const view = useTableRows(table, columnsRows);
  const visible = useVisibleColumns(table);
  const all = useAllColumns(table);
  const layout = table.columnLayout;
  // React sets the `--col-*` custom properties a style object carries, which CSSProperties doesn't list.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const sizeVars = columnSizeVars(visible) as CSSProperties;
  return (
    <>
      <div className="controls">
        <button type="button" onClick={layout.showAll}>
          Show all columns
        </button>
      </div>
      <ul>
        {all.map((column) => {
          const label = labelOf(column);
          return (
            <li key={column.id} className="controls">
              <label>
                <input type="checkbox" checked={column.visible} onChange={() => layout.toggleVisible(column.id)} /> Show {label}
              </label>
              <label>
                Pin {label}{" "}
                <select
                  value={column.zone}
                  onChange={(event) => {
                    const zone = event.target.value;
                    if (isZone(zone)) layout.pin(column.id, zone);
                  }}
                >
                  {zones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={!column.visible} onClick={() => layout.moveColumn(column.id, column.order - 1)}>
                Move {label} left
              </button>
              <button type="button" disabled={!column.visible} onClick={() => layout.moveColumn(column.id, column.order + 1)}>
                Move {label} right
              </button>
              <button type="button" onClick={() => layout.setSize(column.id, (column.size ?? defaultWidth) + widenBy)}>
                Widen {label}
              </button>
            </li>
          );
        })}
      </ul>
      <div data-testid="columns-frame" style={sizeVars}>
        <table data-testid={testIds.table}>
          <thead>
            <tr>
              {visible.map((column) => (
                <th key={column.id} data-col={column.id} data-zone={column.zone} style={{ width: columnWidth(column.id) }}>
                  <span className="label">{labelOf(column)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.id} data-row-id={row.id} data-kind={row.kind}>
                <DataCells table={table} row={row} columns={visible} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Probe table={table} />
    </>
  );
}
