# Solid examples

A Vite app on Solid 2, showing `@lunarhue/table-solid` against a list of 50 invoices. The sidebar switches between views, and the URL hash records which one is open.

## Running it

From the repo root:

```sh
bun install
bun run --filter @lunarhue/table-example-solid dev
```

Vite prints the local URL. `bun run --filter @lunarhue/table-example-solid build` writes a production build to `examples/solid/dist`.

The app resolves `@lunarhue/table-*` through the `@lunarhue/source` export condition, set in both `vite.config.ts` and `tsconfig.json`. That points imports at each package's `src/`, so edits to the library show up on reload without running a package build.

## Views

Each view lives in its own file under `src/examples/`.

- `basic.tsx` is the smallest table. It has columns and rows and no custom cells.
- `general.tsx` ports the React general example: custom cells, headers and footers, multi-sort, filters, pagination, selection with a bulk bar and "select all matching", column layout, and a row detail panel.
- `url-bound.tsx` keeps sorting, the status filter and the page in the query string with `createTableBinding`, and loads rows from a fake server through `createTableRequest`.
- `compact.tsx` is a small table with custom cells, sorting and a status filter, and nothing else.

Props are never destructured, since that would read them once and lose reactivity. Lists of columns and headers use `<For keyed={(item) => item.id}>`. Layout changes produce new column objects, and keying by id keeps the existing cells instead of rebuilding them.
