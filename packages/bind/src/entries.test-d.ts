import type { ControlledGroupBinding, ExternalGroupBinding, ExternalBinding, TableStoreOptions } from "@lunarhue/table-core";
import type { UrlStateOf } from "@lunarhue/table-core/url";
import { createSignal } from "solid-js";
import { expectTypeOf, it } from "vitest";
import { create } from "zustand";
import { createStore } from "zustand/vanilla";
import { usersTable, usersUrl, type Filters, type UsersState } from "./fixtures/users.js";
import { useNuqsBinding, type NuqsBindings } from "./nuqs.js";
import { signal, signalGroup } from "./solid.js";
import { zustand, zustandGroup, type ZustandStore } from "./zustand.js";

type Bind = NonNullable<TableStoreOptions<typeof usersTable>["bind"]>;
type UrlState = UrlStateOf<typeof usersTable, typeof usersUrl.schema>;
type SortingState = UsersState["sorting"];
type PaginationState = UsersState["pagination"];

/** Fails to compile unless `bind` fits the table's `bind` option. */
const fits = (bind: Bind) => bind;

interface AppState {
  sorting: SortingState;
  query: { filtering: Filters; pagination: PaginationState };
}

it("types the nuqs bindings and fits the table's bind option", () => {
  const bind = useNuqsBinding(usersUrl, { prefix: "users_", debounceMs: { search: 300 } });
  expectTypeOf(bind).toEqualTypeOf<NuqsBindings<typeof usersTable, typeof usersUrl.schema>>();
  expectTypeOf(bind.sorting).toEqualTypeOf<ControlledGroupBinding<UrlState>>();
  expectTypeOf(bind.filtering.state.filtering).toEqualTypeOf<Filters>();
  fits(bind);

  const stored = { get: (): SortingState => [], set: (next: SortingState) => void next, subscribe: () => () => {} };
  fits({ ...bind, sorting: stored });
  // @ts-expect-error: not a history mode
  useNuqsBinding(usersUrl, { history: "jump" });
});

it("infers zustand slices from select", () => {
  const store = createStore<AppState>()(() => ({
    sorting: [],
    query: { filtering: {}, pagination: { pageIndex: 0, pageSize: 10 } },
  }));
  const sorting = zustand(store, { select: (s) => s.sorting, update: (next) => ({ sorting: next }) });
  expectTypeOf(sorting).toEqualTypeOf<ExternalBinding<SortingState>>();
  expectTypeOf(zustand(store)).toEqualTypeOf<ExternalBinding<AppState>>();
  fits({ sorting });

  const group = zustandGroup(store, { select: (s) => s.query, update: (query) => ({ query }) });
  expectTypeOf(group).toEqualTypeOf<ExternalGroupBinding<AppState["query"]>>();
  fits({ filtering: group, pagination: group });

  // @ts-expect-error: update must return part of the state
  zustand(store, { select: (s) => s.sorting, update: (next) => ({ sort: next }) });
});

it("takes the hook create returns", () => {
  const useSorting = create<{ sorting: SortingState }>()(() => ({ sorting: [] }));
  expectTypeOf(useSorting).toExtend<ZustandStore<{ sorting: SortingState }>>();
});

it("infers Solid signal slices", () => {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  expectTypeOf(signal(sorting, setSorting)).toEqualTypeOf<ExternalBinding<SortingState>>();
  const [query, setQuery] = createSignal<AppState["query"]>({ filtering: {}, pagination: { pageIndex: 0, pageSize: 10 } });
  const group = signalGroup(query, setQuery);
  expectTypeOf(group).toEqualTypeOf<ExternalGroupBinding<AppState["query"]>>();
  fits({ sorting: signal(sorting, setSorting), filtering: group, pagination: group });
});
