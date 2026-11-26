# React examples

A Vite app on React 19 with the React Compiler, showing `@lunarhue/table-react` against a list of 50 invoices. The sidebar switches between views, and the URL hash records which one is open.

## Running it

From the repo root:

```sh
bun install
bun run --filter @lunarhue/table-example-react dev
```

Vite prints the local URL. `bun run --filter @lunarhue/table-example-react build` writes a production build to `examples/react/dist`.

The app resolves `@lunarhue/table-*` through the `@lunarhue/source` export condition, set in both `vite.config.ts` and `tsconfig.json`. That points imports at each package's `src/`, so edits to the library show up on reload without running a package build.

## Views

Each view lives in its own file under `src/examples/`.

- `basic.tsx` is the smallest table. It has columns and rows and no custom cells.
- `general.tsx` is a full data table:
  - custom cell, header and footer components
  - sorting, with shift-click for multi-sort
  - search and status filters, a "Filtered" pill and a reset button
  - pagination
  - row selection with an indeterminate page checkbox, a bulk action bar and "select all matching", which stores `{ mode: "all", except }` instead of a list of ids
  - column visibility, pinning, resizing through CSS variables, and reordering
  - rows that open a detail panel on click or Enter, through `useRowLink`

  Delete the rows on the last page to watch the pager clamp to the new last page.
- `url-bound.tsx` keeps sorting, the status filter and the page in the query string with `defineStateAdapter` and `useTableBinding`. The table still owns column visibility and selection. A fake server answers each request from `useTableRequest`. Back, forward and reload all restore the table.
- `mini-basic.tsx` uses `useSimpleTable` from `@lunarhue/table-react/mini` with plain columns.
- `mini-custom.tsx` uses the same hook with custom cells, sorting, a search box and selection.

`src/data.ts` builds the invoices from fixed values, so every load shows the same rows.
