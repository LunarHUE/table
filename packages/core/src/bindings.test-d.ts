import { expectTypeOf, it } from "vitest";
import {
  createStateCoordinator,
  type ControlledBinding,
  type ExternalGroupBinding,
  type ExternalBinding,
  type GroupBinding,
  type FeatureBindings,
  type StateCoordinator,
  type StateUpdater,
} from "./bindings.js";

interface State {
  sorting: readonly string[];
  filter: string;
  pagination: { readonly pageIndex: number; readonly pageSize: number };
}

const initial: State = { sorting: [], filter: "", pagination: { pageIndex: 0, pageSize: 10 } };

it("accepts a value or an updater", () => {
  expectTypeOf<number>().toExtend<StateUpdater<number>>();
  expectTypeOf<(prev: number) => number>().toExtend<StateUpdater<number>>();
  expectTypeOf<(prev: number) => string>().not.toExtend<StateUpdater<number>>();
});

it("types each slice's snapshot", () => {
  const table = createStateCoordinator({ initial });
  expectTypeOf(table).toEqualTypeOf<StateCoordinator<State>>();
  expectTypeOf(table.getSnapshot("pagination")).toEqualTypeOf<State["pagination"]>();
  expectTypeOf(table.getServerSnapshot("filter")).toEqualTypeOf<string>();
  // @ts-expect-error no such slice
  table.getSnapshot("rows");
  table.applyPatch({ filter: "a", pagination: (prev) => ({ ...prev, pageIndex: 0 }) });
  // @ts-expect-error filter is a string
  table.applyPatch({ filter: 1 });
  // @ts-expect-error no such slice
  table.applyPatch({ rows: [] });
});

it("checks a single binding against its slice", () => {
  const filter: ExternalBinding<string> = { get: () => "", set: () => {}, subscribe: () => () => {} };
  const sorting: ControlledBinding<readonly string[]> = { kind: "controlled", state: [], onStateChange: () => {} };
  expectTypeOf({ filter, sorting }).toExtend<FeatureBindings<State>>();
  createStateCoordinator({ initial, bindings: { filter, sorting } });
  // @ts-expect-error filter is a string, not a list
  createStateCoordinator({ initial, bindings: { filter: sorting } });
});

it("lets a React setState be onStateChange", () => {
  type SetState<T> = (value: T | ((prev: T) => T)) => void;
  expectTypeOf<SetState<string>>().toExtend<ControlledBinding<string>["onStateChange"]>();
  expectTypeOf<ControlledBinding<string>["onStateChange"]>().parameter(0).toEqualTypeOf<(prev: string) => string>();
});

it("lets one group own several slices", () => {
  type Url = Pick<State, "filter" | "pagination">;
  const url: ExternalGroupBinding<Url> = {
    kind: "group",
    get: () => ({ filter: "", pagination: initial.pagination }),
    set: () => {},
    subscribe: () => () => {},
  };
  expectTypeOf(url).toExtend<GroupBinding<Url>>();
  const bindings: FeatureBindings<State> = { filter: url, pagination: url };
  createStateCoordinator({ initial, bindings });
  // @ts-expect-error the group has no sorting slice
  createStateCoordinator({ initial, bindings: { sorting: url } });

  const wrong: ExternalGroupBinding<{ filter: number }> = {
    kind: "group",
    get: () => ({ filter: 0 }),
    set: () => {},
    subscribe: () => () => {},
  };
  // @ts-expect-error the group's filter is a number
  createStateCoordinator({ initial, bindings: { filter: wrong } });
});
