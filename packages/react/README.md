# @lunarhue/table-react

Headless tables for React, from [table](https://github.com/LunarHUE/table). React Compiler native (zero `"use no memo"`), RSC-safe via the `react-server` export condition, React 18+ by default (React 16.8/17 via the `@lunarhue/react-legacy` condition).

```sh
npm install @lunarhue/table-react
```

```tsx
import {
  Cell,
  Header,
  useHeaderGroups,
  usePagination,
  useTable,
  useTableRows,
  useVisibleColumns,
} from "@lunarhue/table-react";
import { usersTable, type User } from "./users-table";

export function Users({ users }: { readonly users: readonly User[] }) {
  const table = useTable(usersTable);
  const view = useTableRows(table, users);
  const headerGroups = useHeaderGroups(table);
  const columns = useVisibleColumns(table);
  const pager = usePagination(table, view);

  return (
    <>
      <table>
        <thead>
          {headerGroups.map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id}>
                  <Header table={table} header={header} rows={view.rows} />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.id}>
                  <Cell table={table} row={row} column={column} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button disabled={!pager.canPrev} onClick={pager.prev}>Prev</button>
      <button disabled={!pager.canNext} onClick={pager.next}>Next</button>
    </>
  );
}
```

Additional entries:
- `@lunarhue/table-react/a11y` — accessible props and helpers (`ariaSort`, `selectInputProps`, `selectAllInputProps`, `useRowLink`, `useRovingTabIndex`, `isInteractiveEvent`).
- `@lunarhue/table-react/mini` — `useSimpleTable`, a ~1.2 kB single-hook client table with zero core imports.
- `@lunarhue/table-react/legacy` — React 16.8/17 fallbacks for `useSyncExternalStore`, `useId`, and `useTransition`.
