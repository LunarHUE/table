import { a11yRows, a11yTable, gridCells, openedText, type Person, testIds } from "@lunarhue/table-e2e/contract";
import { type ColumnView, type Row, type TableStore, useTable, useTableRows, useVisibleColumns } from "@lunarhue/table-react";
import { useRowLink, useRovingTabIndex } from "@lunarhue/table-react/a11y";
import { useState } from "react";
import { createPortal } from "react-dom";
import { DataCells, PlainHeader, Probe } from "../parts.js";

interface LinkRowProps {
  readonly table: TableStore<typeof a11yTable>;
  readonly row: Row<Person>;
  readonly columns: readonly ColumnView<Person>[];
  readonly onOpen: (name: string) => void;
  readonly onRename: (name: string) => void;
}

/**
 * A row that opens on a click or on Enter or Space. Its link and its menu
 * button handle their own clicks, and so does the menu, which renders in a
 * portal outside the row but bubbles through it in React's tree.
 */
function LinkRow({ table, row, columns, onOpen, onRename }: LinkRowProps) {
  const name = row.original.name;
  const link = useRowLink(() => onOpen(name));
  const [menu, setMenu] = useState(false);
  return (
    <tr data-row-id={row.id} data-kind={row.kind} aria-label={name} {...link}>
      <DataCells table={table} row={row} columns={columns} />
      <td>
        <a href={`#${row.id}`}>View {name}</a>
      </td>
      <td>
        <button type="button" aria-expanded={menu} onClick={() => setMenu((open) => !open)}>
          Actions for {name}
        </button>
        {menu
          ? createPortal(
              <div role="dialog" aria-label={`Menu for ${name}`}>
                <p>Options for {name}</p>
                <button
                  type="button"
                  onClick={() => {
                    onRename(name);
                    setMenu(false);
                  }}
                >
                  Rename
                </button>
              </div>,
              document.body,
            )
          : null}
      </td>
    </tr>
  );
}

/** A grid with one tab stop, moved by the arrow keys, Home and End. */
function KeyboardGrid() {
  const roving = useRovingTabIndex({ rowCount: gridCells.length, colCount: gridCells[0]?.length ?? 0 });
  return (
    <table role="grid" aria-label="Keyboard grid">
      <tbody>
        {gridCells.map((cells, r) => (
          <tr key={cells.join()}>
            {cells.map((text, c) => (
              <td key={text} {...roving.getCellProps(r, c)}>
                {text}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function A11yPage() {
  const table = useTable(a11yTable);
  const view = useTableRows(table, a11yRows);
  const columns = useVisibleColumns(table);
  const [opened, setOpened] = useState<string>();
  const [renamed, setRenamed] = useState<string>();
  return (
    <>
      <table data-testid={testIds.table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <PlainHeader key={column.id} column={column} />
            ))}
            <th>Link</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <LinkRow key={row.id} table={table} row={row} columns={columns} onOpen={setOpened} onRename={setRenamed} />
          ))}
        </tbody>
      </table>
      <p data-testid="opened">{openedText(opened)}</p>
      <p data-testid="renamed">{renamed === undefined ? "" : `Renamed ${renamed}`}</p>
      <KeyboardGrid />
      <Probe table={table} />
    </>
  );
}
