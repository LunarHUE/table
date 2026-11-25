# @lunarhue/table-solid

Headless tables for Solid 2, from [table](https://github.com/LunarHUE/table).

```sh
npm install @lunarhue/table-solid solid-js @solidjs/web
```

Each primitive mirrors one part of the table's state in a signal, for the
life of the component that made it. Toggling one row's selection wakes that
row's cell and nothing else: not the other rows, not the row list.

```tsx
import { For } from "solid-js";
import { Cell, createHeaderGroups, createPagination, createTable, createTableRows, createVisibleColumns, Header } from "@lunarhue/table-solid";
import { usersTable } from "./users-table";

function Users(props: { users: readonly User[] }) {
  const table = createTable(usersTable);
  const view = createTableRows(table, () => props.users);
  const headerGroups = createHeaderGroups(table);
  const columns = createVisibleColumns(table);
  const pager = createPagination(table, view);
  return (
    <>
      <table>
        <thead>
          <For each={headerGroups()}>
            {(group) => (
              <tr>
                <For each={group.headers}>{(header) => <th><Header table={table} header={header} rows={view().rows} /></th>}</For>
              </tr>
            )}
          </For>
        </thead>
        <tbody>
          <For each={view().rows}>
            {(row) => (
              <tr>
                <For each={columns()}>{(column) => <td><Cell table={table} row={row} column={column} /></td>}</For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
      <button disabled={!pager.canNext} onClick={pager.next}>Next</button>
    </>
  );
}
```

Cell components take one prop, `cell`, and read it without destructuring:
`props.cell.value`. Attach a feature's part with `defineCell` to get its
members, as `defineCell(SelectCell, selectable())` gives `cell.selected` and
`cell.toggleSelected`. Every command the primitives hand out takes no
arguments, so it can go straight into `onClick` or `onChange`.

`createTable` takes its options, or an accessor of them, and passes changes
to `omitColumns`, `meta` and controlled `bind` slices to the table. On the
server every primitive reads the table's server snapshot and subscribes to
nothing.
