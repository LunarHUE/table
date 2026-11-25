# @lunarhue/table-core

The framework-free core of [table](https://github.com/LunarHUE/table): RSC-safe table definitions, composable features, row and column pipelines, and unopinionated state-adapter primitives.

```sh
npm install @lunarhue/table-core
```

```ts
import {
  defineTable,
  filtering,
  pagination,
  selection,
  sorting,
  visibility,
} from "@lunarhue/table-core";

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export const usersTable = defineTable<User>()({
  getRowId: (user) => user.id,
  columns: (col) => [
    col.key("name", { label: "Name", sortable: true }),
    col.key("email", { label: "Email", sortable: true }),
  ],
  features: [
    sorting(),
    filtering({ initial: { q: "" }, rows: (u, f) => !f.q || u.name.toLowerCase().includes(f.q.toLowerCase()) }),
    pagination({ sizes: [10, 25, 50] }),
    selection(),
    visibility(),
  ],
});
```

Server-driven tables swap in `remoteSorting()`, `remoteFiltering()`, and `remotePagination()` to omit client row stages and expose a typed request via `store.getRequest()` or `resolveTableState(def, partial)`. Use `defineStateAdapter({ features, parse, serialize })` to build one shared URL or persistence adapter for your app's own schema and router conventions.
