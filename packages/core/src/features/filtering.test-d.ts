import { expectTypeOf, it } from "vitest";
import { defineTable, type NeedsInitialState, type RequestOf, type StateOf } from "../define-table.js";
import { hasFeature } from "../feature.js";
import { createTableStore } from "../store.js";
import {
  createFilterDraft,
  filtering,
  remoteFiltering,
  type FilteringApi,
  type FilteringFeature,
  type RemoteFilteringFeature,
} from "./filtering.js";

interface User {
  readonly id: string;
  readonly name: string;
}

// An interface, with no index signature.
interface UserFilters {
  search: string;
  role?: "admin" | "member";
  tags?: readonly string[];
}

interface OptionalFilters {
  search?: string;
  tags?: readonly string[];
}

const byName = (user: User, filters: UserFilters) => user.name.includes(filters.search);
const columns = [] as const;

it("takes an interface without an index signature", () => {
  expectTypeOf(filtering({ rows: byName })).toEqualTypeOf<NeedsInitialState<FilteringFeature<UserFilters, User>>>();
  expectTypeOf(filtering({ rows: byName, initial: { search: "" } })).toEqualTypeOf<FilteringFeature<UserFilters, User>>();
  expectTypeOf(remoteFiltering<UserFilters>()).toEqualTypeOf<NeedsInitialState<RemoteFilteringFeature<UserFilters>>>();
  expectTypeOf(remoteFiltering<OptionalFilters>()).toEqualTypeOf<RemoteFilteringFeature<OptionalFilters>>();
});

it("requires initialState.filtering when the filters have a required key and no initial", () => {
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [filtering({ rows: byName })],
    initialState: { filtering: { search: "" } },
  });
  // @ts-expect-error `initialState.filtering` is missing.
  defineTable<User>()({ getRowId: (row) => row.id, columns, features: [filtering({ rows: byName })] });
  // @ts-expect-error `initialState.filtering` is missing.
  defineTable<User>()({ getRowId: (row) => row.id, columns, features: [remoteFiltering<UserFilters>()] });
  defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [remoteFiltering<UserFilters>()],
    // @ts-expect-error `search` is required.
    initialState: { filtering: { role: "admin" } },
  });
  defineTable<User>()({ getRowId: (row) => row.id, columns, features: [filtering({ rows: byName, initial: { search: "" } })] });
  const optional = defineTable<User>()({ getRowId: (row) => row.id, columns, features: [remoteFiltering<OptionalFilters>()] });
  expectTypeOf<StateOf<typeof optional>["filtering"]>().toEqualTypeOf<{ search?: string; tags?: readonly string[] }>();
});

const def = defineTable<User>()({
  getRowId: (row) => row.id,
  columns,
  features: [filtering({ rows: byName })],
  initialState: { filtering: { search: "" } },
});
const store = createTableStore(def);

it("types the API by the filters", () => {
  expectTypeOf(store.filtering).toEqualTypeOf<FilteringApi<UserFilters>>();
  expectTypeOf<StateOf<typeof def>["filtering"]>().toEqualTypeOf<{ search: string; role?: "admin" | "member"; tags?: readonly string[] }>();

  store.filtering.set("search", "a");
  store.filtering.set("search", (prev) => prev.trim());
  store.filtering.set("role", "admin");
  // Removes the key, sound under `exactOptionalPropertyTypes`.
  store.filtering.set("role", undefined);
  store.filtering.set("role", (prev) => (prev === "admin" ? undefined : "admin"));
  // @ts-expect-error `search` is required, so it can't be removed.
  store.filtering.set("search", undefined);
  // @ts-expect-error `role` takes "admin" or "member".
  store.filtering.set("role", "owner");
  // @ts-expect-error No filter is named `nope`.
  store.filtering.set("nope", "a");

  store.filtering.unset("role");
  // @ts-expect-error `search` is required.
  store.filtering.unset("search");

  store.filtering.toggle("tags", "vip");
  // @ts-expect-error `tags` holds strings.
  store.filtering.toggle("tags", 123);
  // @ts-expect-error `search` isn't an array.
  store.filtering.toggle("search", "a");

  store.filtering.replace({ search: "" });
  store.filtering.replace((prev) => ({ ...prev, role: "member" }));
  // @ts-expect-error `search` is required.
  store.filtering.replace({ role: "member" });
});

it("puts the filters in the request only for remoteFiltering", () => {
  expectTypeOf(store.getRequest()).not.toHaveProperty("filtering");
  const remote = defineTable<User>()({
    getRowId: (row) => row.id,
    columns,
    features: [remoteFiltering<UserFilters>()],
    initialState: { filtering: { search: "" } },
  });
  expectTypeOf<RequestOf<typeof remote>>().toEqualTypeOf<{
    readonly filtering: { search: string; role?: "admin" | "member"; tags?: readonly string[] };
  }>();
});

it("narrows a table with hasFeature under either factory", () => {
  const table = createTableStore(defineTable<User>()({ getRowId: (row) => row.id, columns }));
  expectTypeOf(hasFeature(table, filtering)).toEqualTypeOf<boolean>();
  if (hasFeature(table, filtering)) expectTypeOf(table.filtering).toEqualTypeOf<FilteringApi<object>>();
  if (hasFeature(table, remoteFiltering)) expectTypeOf(table.filtering).toEqualTypeOf<FilteringApi<object>>();
});

it("types a draft by the table's filters", () => {
  const draft = createFilterDraft(store);
  expectTypeOf(draft.get()).toEqualTypeOf<UserFilters>();
  draft.set("role", undefined);
  draft.toggle("tags", "vip");
  // @ts-expect-error `tags` holds strings.
  draft.toggle("tags", 1);
});
