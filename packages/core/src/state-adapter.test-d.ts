import { expectTypeOf, it } from "vitest";
import { bindGroup, type ControlledGroupBinding, type ExternalGroupBinding, type FeatureBindings } from "./bindings.js";
import { defineTable, type RequestOf, type StateOf } from "./define-table.js";
import { remoteFiltering } from "./features/filtering.js";
import { remotePagination, type PaginationState } from "./features/pagination.js";
import { selection } from "./features/selection.js";
import { remoteSorting, type SortEntry } from "./features/sorting.js";
import { defineStateAdapter, resolveTableState } from "./state-adapter.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly role: "admin" | "member";
}

interface UsersFilters {
  readonly q: string;
  readonly role: "all" | "admin" | "member";
}

const usersTable = defineTable<User>()({
  getRowId: (u) => u.id,
  columns: (col) => [
    col.key("name", { sortable: true }),
    col.key("role", { sortable: true }),
    col.key("id"),
  ],
  features: [
    remoteSorting(),
    remoteFiltering<UsersFilters>({ initial: { q: "", role: "all" } }),
    remotePagination({ sizes: [20, 50] }),
    selection(),
  ],
});

type UsersState = StateOf<typeof usersTable>;

it("types bindGroup for both controlled and external owners and fits FeatureBindings", () => {
  const controlled = bindGroup(["sorting", "pagination"] as const, {
    state: { sorting: [] as UsersState["sorting"], pagination: { pageIndex: 0, pageSize: 20 } },
    onStateChange: () => {},
  });
  expectTypeOf(controlled.sorting).toEqualTypeOf<
    ControlledGroupBinding<{ sorting: UsersState["sorting"]; pagination: { pageIndex: number; pageSize: number } }>
  >();
  expectTypeOf(controlled).toExtend<FeatureBindings<UsersState>>();

  const external = bindGroup(["sorting", "pagination"] as const, {
    get: () => ({ sorting: [] as UsersState["sorting"], pagination: { pageIndex: 0, pageSize: 20 } }),
    set: () => {},
    subscribe: () => () => {},
  });
  expectTypeOf(external.pagination).toEqualTypeOf<
    ExternalGroupBinding<{ sorting: UsersState["sorting"]; pagination: { pageIndex: number; pageSize: number } }>
  >();
  expectTypeOf(external).toExtend<FeatureBindings<UsersState>>();
});

it("widens branded column ids on resolveTableState input and narrows them on output", () => {
  const rawSort: readonly { readonly id: string; readonly desc: boolean }[] = [{ id: "name", desc: true }];
  const resolved = resolveTableState(usersTable, {
    sorting: rawSort,
    pagination: { pageIndex: 1 },
    filtering: { q: "ada" },
  });

  expectTypeOf(resolved.state).toEqualTypeOf<UsersState>();
  expectTypeOf(resolved.state.sorting).toEqualTypeOf<readonly { readonly id: "name" | "role"; readonly desc: boolean }[]>();
  expectTypeOf(resolved.request).toEqualTypeOf<RequestOf<typeof usersTable>>();
  expectTypeOf(resolved.requestKey).toEqualTypeOf<string>();

  // @ts-expect-error: invalid filter role union member rejected on input
  resolveTableState(usersTable, { filtering: { role: "superadmin" } });
});

it("auto-types serialize state and defaults from features in defineStateAdapter", () => {
  const adapter = defineStateAdapter({
    features: ["sorting", "pagination", "filtering"] as const,
    parse(raw: Record<string, string | undefined>, filters?: { parse(x: unknown): Record<string, unknown> }) {
      return {
        sorting: raw.sort ? [{ id: raw.sort, desc: false }] : [],
        pagination: { pageIndex: 0 },
        ...(filters ? { filtering: filters.parse(raw) } : {}),
      };
    },
    serialize(state, defaults) {
      expectTypeOf(state.sorting).toEqualTypeOf<readonly { readonly id: string; readonly desc: boolean }[] | undefined>();
      expectTypeOf(state.pagination).toEqualTypeOf<PaginationState | undefined>();
      expectTypeOf(defaults.pagination).toEqualTypeOf<PaginationState | undefined>();
      expectTypeOf(state.filtering).toEqualTypeOf<Readonly<Record<string, unknown>> | undefined>();
      return { sort: state.sorting?.[0]?.id };
    },
  });

  // Optional `extra` works with 2 or 3 arguments
  const a = adapter.resolve(usersTable, {});
  const b = adapter.resolve(usersTable, {}, { parse: () => ({ q: "" }) });
  expectTypeOf(a.state).toEqualTypeOf<UsersState>();
  expectTypeOf(b.request).toEqualTypeOf<RequestOf<typeof usersTable>>();
  expectTypeOf(adapter.serialize({}, {})).toEqualTypeOf<{ sort: string | undefined }>();
});

it("requires extra argument when parse declares a required second parameter", () => {
  const strict = defineStateAdapter({
    features: ["sorting"] as const,
    parse(_raw: string, prefix: string) {
      return { sorting: [{ id: prefix, desc: false }] satisfies readonly SortEntry[] };
    },
    serialize: (state) => state.sorting?.length ?? 0,
  });

  const resolved = strict.resolve(usersTable, "name", "u_");
  expectTypeOf(resolved.state).toEqualTypeOf<UsersState>();
  // @ts-expect-error: missing required extra argument
  strict.resolve(usersTable, "name");
});
