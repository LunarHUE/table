# @lunarhue/table-bind

Keep [table](https://github.com/LunarHUE/table) state in nuqs (`./nuqs`), a Zustand store (`./zustand`) or a Solid signal (`./solid`).

```sh
npm install @lunarhue/table-bind
```

Each entry returns bindings for a table's `bind` option. A slice with no binding stays in the table.

## nuqs

`useNuqsBinding` keeps the slices of a `defineTableUrl` schema in the query string. Defaults and codecs come from the table URL, so the server's `parseTableUrl` and the client read the same state.

```tsx
import { useNuqsBinding } from "@lunarhue/table-bind/nuqs";

const [pending, startTransition] = useTransition();
const table = useTable(usersTable, {
  bind: useNuqsBinding(usersUrl, { shallow: false, startTransition, debounceMs: { search: 300 } }),
});
```

Every slice shares one binding. A new filter and the page reset it causes are one URL update, and two commands in one event handler both land. The table's state changes at once, so a search box never lags behind typing. Only the URL write waits for `debounceMs` or `throttleMs`, and only the navigation runs in `startTransition`.

Options: `prefix`, `shallow`, `history`, `startTransition`, `throttleMs`, `debounceMs` (a number, or a record by query key or slice name) and `clearOnDefault` (default `true`). Spread the result to keep other slices elsewhere: `{ ...useNuqsBinding(usersUrl), visibility: storedVisibility }`.

## Zustand

```ts
import { zustand, zustandGroup } from "@lunarhue/table-bind/zustand";

const sorting = zustand(store, { select: (s) => s.sorting, update: (sorting) => ({ sorting }) });
const query = zustandGroup(store, { select: (s) => s.query, update: (query) => ({ query }) });
useTable(usersTable, { bind: { sorting, filtering: query, pagination: query } });
```

`zustand(store)` with no options binds the whole state and replaces it on write. Pass `isEqual` when `select` builds a new object each time. A group calls `setState` once for a change to several of its slices.

## Solid

```ts
import { signal, signalGroup } from "@lunarhue/table-bind/solid";

const [sorting, setSorting] = createSignal<SortingState>([]);
const bind = { sorting: signal(sorting, setSorting) };
```

The effect that watches the signal lives in its own root, made on the table's first listener and disposed on its last. `signalGroup` owns several slices through one signal.
