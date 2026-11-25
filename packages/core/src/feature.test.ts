import { describe, expect, it } from "vitest";
import { ROW_STAGE_PHASES, type ColumnInfo, type RowLike, type RowsEffectContext } from "./index.js";
import {
  defineFeature,
  hasFeature,
  part,
  resolveFeatures,
  type AnyFeature,
  type AnyFeatureFactory,
} from "./feature.js";
import { problem } from "./problem.js";

const row = (id: string): RowLike => ({ kind: "data", id, index: 0, depth: 0, parentId: null, original: id });
const columns: readonly ColumnInfo[] = [{ id: "name" }, { id: "age" }];
const noRequirements = (): never => {
  throw new Error("This feature requires none.");
};
const pageState = (options: { pageSize: number }) => ({ pageIndex: 0, pageSize: options.pageSize });
const noneHidden: Readonly<Record<string, boolean>> = {};
// Features that require each other can't infer each other's types, so these go through a helper.
const needing = (name: string, need: () => AnyFeatureFactory) => defineFeature({ name, requires: () => [need()] });
const names = (features: readonly AnyFeature[]) => features.map((feature) => feature.name);

function filtering<TFilters extends Readonly<Record<string, string>>>(options: { readonly initial: TFilters }) {
  return defineFeature({ name: "filtering", state: { initial: options.initial }, request: (state) => state })();
}
filtering.featureName = "filtering" as const;

describe("defineFeature", () => {
  it("makes a factory that names the feature and makes frozen features", () => {
    const sorting = defineFeature({ name: "sorting", state: { initial: [] as readonly string[] } });
    expect(sorting.featureName).toBe("sorting");
    const feature = sorting();
    expect(feature.name).toBe("sorting");
    expect(feature.options).toBeUndefined();
    expect(Object.isFrozen(feature)).toBe(true);
    expect(sorting()).not.toBe(feature);
  });

  it("keeps the options and the definition", () => {
    const pagination = defineFeature({ name: "pagination", state: { initial: pageState } });
    const feature = pagination({ pageSize: 25 });
    expect(feature.options).toEqual({ pageSize: 25 });
    expect(feature.def.state?.initial).toBe(pageState);
  });

  it("carries all five seams", () => {
    const remoteSorting = defineFeature({
      name: "remoteSorting",
      state: { initial: { by: "name" }, rowsEffect: "view" },
      api: (ctx) => ({ sortBy: (by: string) => ctx.setState({ by }) }),
      rowStage: { phase: "sort", reads: ["filtering"], run: (rows) => rows.filter((r) => r.id !== "a") },
      columnStage: (cols) => cols.filter((column) => column.id !== "hidden"),
      request: (state) => ({ orderBy: state.by }),
    });
    const { def } = remoteSorting();
    expect(def.state?.rowsEffect).toBe("view");
    expect(def.rowStage?.phase).toBe("sort");
    expect(def.rowStage?.reads).toEqual(["filtering"]);
    const ctx = { state: { by: "name" }, options: undefined, columns, getFeatureState: noRequirements };
    expect(def.rowStage?.run([row("a"), row("b")], ctx).map((r) => r.id)).toEqual(["b"]);
    const view = { visible: true, zone: "center" as const, order: 0 };
    expect(def.columnStage?.([{ id: "hidden", ...view }, { id: "name", ...view }], { by: "name" }).map((c) => c.id)).toEqual([
      "name",
    ]);
    expect(def.request?.({ by: "age" })).toEqual({ orderBy: "age" });

    const writes: unknown[] = [];
    const api = def.api?.({
      name: "remoteSorting",
      options: undefined,
      initial: { by: "name" },
      getState: () => ({ by: "name" }),
      setState: (next, options) => writes.push([next, options]),
      patch: () => {},
      getFeatureState: noRequirements,
      columns: () => columns,
    });
    api?.sortBy("age");
    expect(writes).toEqual([[{ by: "age" }, undefined]]);
  });

  it("leaves out the seams a feature doesn't have", () => {
    const client = defineFeature({ name: "filtering", state: { initial: "" }, rowStage: { phase: "filter", run: (rows) => rows } })();
    expect(client.def.request).toBeUndefined();
    expect(client.def.api).toBeUndefined();
    const remote = defineFeature({ name: "remoteFiltering", state: { initial: "" }, request: (state) => ({ q: state }) })();
    expect(remote.def.rowStage).toBeUndefined();
    const visibility = defineFeature({
      name: "visibility",
      state: { initial: {}, rowsEffect: "none" },
      columnStage: (cols) => cols,
    })();
    expect(visibility.def.state?.rowsEffect).toBe("none");
    expect(visibility.def.rowStage).toBeUndefined();
    expect(visibility.def.request).toBeUndefined();
  });

  it("lets state react to rows effects and to new columns", () => {
    const pagination = defineFeature({
      name: "pagination",
      state: {
        initial: { pageIndex: 3, pageSize: 10 },
        onRowsEffect: (effect, state) => (effect === "matching" ? { ...state, pageIndex: 0 } : state),
      },
    })();
    const ctx: RowsEffectContext<void> = { options: undefined, columns, source: "filtering" };
    const state = { pageIndex: 3, pageSize: 10 };
    expect(pagination.def.state?.onRowsEffect?.("matching", state, ctx)).toEqual({ pageIndex: 0, pageSize: 10 });
    expect(pagination.def.state?.onRowsEffect?.("view", state, ctx)).toBe(state);

    const visibility = defineFeature({
      name: "visibility",
      state: {
        initial: noneHidden,
        normalize: (hidden, cols) => Object.fromEntries(cols.filter((c) => c.id in hidden).map((c) => [c.id, hidden[c.id] ?? true])),
      },
    })();
    expect(visibility.def.state?.normalize?.({ name: false, gone: false }, columns)).toEqual({ name: false });
  });

  it("works inside a generic factory", () => {
    const feature = filtering({ initial: { name: "ada" } });
    expect(feature.def.state?.initial).toEqual({ name: "ada" });
    expect(resolveFeatures([feature]).featureNames.has(filtering.featureName)).toBe(true);
  });
});

describe("resolveFeatures", () => {
  const sorting = defineFeature({ name: "sorting" });
  const pagination = defineFeature({ name: "pagination", requires: () => [sorting] });
  const selection = defineFeature({ name: "selection", requires: () => [pagination, sorting] });

  it("puts required features first and keeps install order otherwise", () => {
    const resolved = resolveFeatures([selection(), pagination(), sorting()]);
    expect(names(resolved.ordered)).toEqual(["sorting", "pagination", "selection"]);
    expect([...resolved.featureNames]).toEqual(["selection", "pagination", "sorting"]);
    expect(resolved.byName.get("pagination")?.name).toBe("pagination");
    expect(names(resolveFeatures([sorting(), defineFeature({ name: "a" })(), pagination()]).ordered)).toEqual([
      "sorting",
      "a",
      "pagination",
    ]);
  });

  it("calls requires only when resolving", () => {
    let calls = 0;
    const lazy = defineFeature({
      name: "lazy",
      requires: () => {
        calls++;
        return [sorting];
      },
    });
    const feature = lazy();
    expect(calls).toBe(0);
    resolveFeatures([feature, sorting()]);
    expect(calls).toBe(1);
  });

  it("throws for a missing required feature", () => {
    expect(() => resolveFeatures([selection(), sorting()])).toThrow(problem("feature:missing", "pagination selection"));
  });

  it("throws for a duplicate name", () => {
    expect(() => resolveFeatures([sorting(), sorting()])).toThrow(problem("feature:duplicate", "sorting"));
  });

  it("throws for direct and indirect cycles", () => {
    const self = needing("self", () => self);
    expect(() => resolveFeatures([self()])).toThrow(problem("feature:cycle", "self"));

    const a = needing("a", () => c);
    const b = needing("b", () => a);
    const c = needing("c", () => b);
    expect(() => resolveFeatures([a(), b(), c()])).toThrow(problem("feature:cycle", "a"));
  });

  it("throws for a feature from another copy of core", () => {
    const foreign: AnyFeature = { ...sorting(), "~core": {} };
    expect(() => resolveFeatures([foreign])).toThrow(problem("store:copies"));
    // A feature that never went through defineFeature, as plain JavaScript could pass.
    const unbranded: AnyFeature = { ...sorting() };
    Reflect.deleteProperty(unbranded, "~core");
    expect(() => resolveFeatures([unbranded])).toThrow(problem("store:copies"));
  });
});

describe("part", () => {
  it("names its feature and keeps its config", () => {
    const selection = defineFeature({ name: "selection" });
    const config = { header: true };
    const selectable = part(selection, config);
    expect(selectable).toEqual({ feature: "selection", config });
    expect(selectable.config).toBe(config);
    expect(Object.isFrozen(selectable)).toBe(true);
  });
});

describe("hasFeature", () => {
  it("checks a table's feature names by name or factory", () => {
    const sorting = defineFeature({ name: "sorting" });
    const paging = defineFeature({ name: "pagination" });
    const table = resolveFeatures([sorting()]);
    expect(hasFeature(table, sorting)).toBe(true);
    expect(hasFeature(table, "sorting")).toBe(true);
    expect(hasFeature(table, paging)).toBe(false);
    expect(hasFeature(table, "pagination")).toBe(false);
  });
});

it("lists the row stage phases in order", () => {
  expect(ROW_STAGE_PHASES).toEqual(["filter", "sort", "flatten", "window", "decorate"]);
});
