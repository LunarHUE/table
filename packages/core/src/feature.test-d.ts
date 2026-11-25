import { expectTypeOf, it } from "vitest";
import type { JsonObject } from "./contract.js";
import {
  defineFeature,
  hasFeature,
  part,
  resolveFeatures,
  type AnyFeature,
  type AnyFeatureFactory,
  type FeatureApiMap,
  type FeatureNameOf,
  type FeaturePart,
  type FeatureStateMap,
  type MissingRequirements,
  type RequiredFeatureNames,
  type ServerRequestMap,
} from "./feature.js";

interface Sort {
  readonly id: string;
  readonly desc: boolean;
}

const sorting = defineFeature({
  name: "sorting",
  state: { initial: [] as readonly Sort[] },
  api: (ctx) => ({
    sortBy: (id: string) => ctx.setState([{ id, desc: false }]),
    clear: () => ctx.setState([]),
  }),
  rowStage: { phase: "sort", run: (rows) => rows },
});

const pagination = defineFeature({
  name: "pagination",
  state: {
    initial: (options: { pageSize: number }) => ({ pageIndex: 0, pageSize: options.pageSize }),
    onRowsEffect: (effect, state) => (effect === "matching" ? { ...state, pageIndex: 0 } : state),
  },
  api: (ctx) => ({ setPage: (pageIndex: number) => ctx.setState((prev) => ({ ...prev, pageIndex })) }),
  request: (state) => ({ offset: state.pageIndex * state.pageSize, limit: state.pageSize }),
});

const noneHidden: Readonly<Record<string, boolean>> = {};

const visibility = defineFeature({
  name: "visibility",
  state: { initial: noneHidden, rowsEffect: "none" },
  columnStage: (columns, state) => columns.map((column) => ({ ...column, visible: state[column.id] !== false })),
});

const columnSort = defineFeature({
  name: "columnSort",
  requires: () => [sorting],
  api: (ctx) => ({ first: () => ctx.getFeatureState("sorting")[0] }),
});

/** A feature whose state type the app gives, as `remoteFiltering<UserFilters>()`. */
function remoteFiltering<TFilters extends JsonObject>(options: { readonly initial: TFilters }) {
  return defineFeature({
    name: "remoteFiltering",
    state: { initial: options.initial, rowsEffect: "matching" },
    api: (ctx) => ({ set: (filters: TFilters) => ctx.setState(filters, { rowsEffect: "matching" }) }),
    request: (state) => ({ filters: state }),
  })();
}
remoteFiltering.featureName = "remoteFiltering" as const;

type UserFilters = { readonly name: string; readonly active: boolean };

const features = [
  sorting(),
  pagination({ pageSize: 20 }),
  visibility(),
  remoteFiltering<UserFilters>({ initial: { name: "", active: true } }),
] as const;
type Features = typeof features;

it("infers each seam's types", () => {
  expectTypeOf(sorting.featureName).toEqualTypeOf<"sorting">();
  expectTypeOf(sorting().options).toEqualTypeOf<void>();
  expectTypeOf(pagination({ pageSize: 10 }).options).toEqualTypeOf<{ pageSize: number }>();
  // @ts-expect-error pagination takes options
  pagination();
  // @ts-expect-error sorting takes none
  sorting({});
  expectTypeOf<FeatureNameOf<typeof pagination>>().toEqualTypeOf<"pagination">();
  expectTypeOf<FeatureNameOf<ReturnType<typeof pagination>>>().toEqualTypeOf<"pagination">();
});

it("fits every feature into AnyFeature and every factory into AnyFeatureFactory", () => {
  expectTypeOf(sorting()).toExtend<AnyFeature>();
  expectTypeOf(columnSort()).toExtend<AnyFeature>();
  expectTypeOf(remoteFiltering<UserFilters>({ initial: { name: "", active: false } })).toExtend<AnyFeature>();
  expectTypeOf(pagination).toExtend<AnyFeatureFactory>();
  expectTypeOf(remoteFiltering).toExtend<AnyFeatureFactory>();
  resolveFeatures(features);
});

it("maps APIs by name, leaving out features without one", () => {
  type Api = FeatureApiMap<Features>;
  expectTypeOf<keyof Api>().toEqualTypeOf<"sorting" | "pagination" | "remoteFiltering">();
  expectTypeOf<Api["sorting"]>().toEqualTypeOf<{ sortBy: (id: string) => void; clear: () => void }>();
  expectTypeOf<Api["remoteFiltering"]>().toEqualTypeOf<{ set: (filters: UserFilters) => void }>();
  expectTypeOf<Api>().not.toHaveProperty("selection");
  expectTypeOf<Api>().not.toHaveProperty("visibility");
});

it("maps states by name", () => {
  type State = FeatureStateMap<Features>;
  expectTypeOf<State>().toEqualTypeOf<{
    readonly sorting: readonly Sort[];
    readonly pagination: { pageIndex: number; pageSize: number };
    readonly visibility: Readonly<Record<string, boolean>>;
    readonly remoteFiltering: UserFilters;
  }>();
});

it("maps requests of remote features only", () => {
  expectTypeOf<ServerRequestMap<Features>>().toEqualTypeOf<{
    readonly pagination: { offset: number; limit: number };
    readonly remoteFiltering: { filters: UserFilters };
  }>();
});

it("types the required features' state in the api context", () => {
  expectTypeOf<FeatureApiMap<[ReturnType<typeof columnSort>]>["columnSort"]>().toEqualTypeOf<{
    first: () => Sort | undefined;
  }>();
  defineFeature({
    name: "bad",
    requires: () => [sorting],
    api: (ctx) => {
      // @ts-expect-error pagination isn't required
      ctx.getFeatureState("pagination");
      ctx.patch({ sorting: [] });
      // @ts-expect-error bad has no state
      ctx.patch({ bad: 1 });
      // @ts-expect-error pagination isn't required
      ctx.patch({ pagination: { pageIndex: 0, pageSize: 1 } });
      return {};
    },
  });
});

it("finds required features missing from a list", () => {
  expectTypeOf<MissingRequirements<[ReturnType<typeof columnSort>]>>().toEqualTypeOf<"sorting">();
  expectTypeOf<MissingRequirements<[ReturnType<typeof columnSort>, ReturnType<typeof sorting>]>>().toBeNever();
});

it("keeps a part's feature name, config and API", () => {
  const selectable = part<"sorting", { readonly header: boolean }, { readonly toggle: () => void }>(sorting, {
    header: true,
  });
  expectTypeOf(selectable).toEqualTypeOf<FeaturePart<"sorting", { readonly header: boolean }, { readonly toggle: () => void }>>();
  const filterable = part(remoteFiltering, { debounce: 200 });
  expectTypeOf(filterable.feature).toEqualTypeOf<"remoteFiltering">();
  expectTypeOf(filterable.config).toEqualTypeOf<{ debounce: number }>();
  expectTypeOf<RequiredFeatureNames<[typeof selectable, typeof filterable]>>().toEqualTypeOf<
    "sorting" | "remoteFiltering"
  >();
});

declare const table: { readonly featureNames: ReadonlySet<string>; readonly id: string };

it("narrows a table handle", () => {
  // @ts-expect-error not narrowed yet
  void table.sorting;
  if (hasFeature(table, sorting)) {
    expectTypeOf(table.sorting).toEqualTypeOf<{ sortBy: (id: string) => void; clear: () => void }>();
    expectTypeOf(table.id).toEqualTypeOf<string>();
  }
  if (hasFeature(table, remoteFiltering)) {
    expectTypeOf(table.remoteFiltering.set).parameter(0).toEqualTypeOf<JsonObject>();
  }
  if (hasFeature(table, "pagination")) {
    expectTypeOf(table.pagination).toBeUnknown();
  }
  if (hasFeature(table, visibility)) {
    // @ts-expect-error visibility has no API
    void table.visibility;
  }
});
