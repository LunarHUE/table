import { defineFeature, part, type FeatureApiContext, type FeaturePart, type FeatureStateSeam } from "../feature.js";

// Selection is client state only: it never runs the row pipeline and never
// goes in the server request. It is keyed by row, so toggling a row wakes the
// subscribers of that row and no others. Besides a list of ids it can hold
// "every matching row except these", so a bulk action can cover rows the
// browser never loaded.

/** `"single"` keeps at most one row selected; `"multi"` keeps any number. */
export type SelectionMode = "single" | "multi";

/**
 * When a write that changes the matching rows, such as a new filter, clears
 * the selection. `"all-only"` clears only "all matching", whose meaning the
 * write changed. `"always"` clears any selection. `"never"` keeps it.
 */
export type SelectionResetPolicy = "all-only" | "always" | "never";

/** The selection slice of table state: listed row ids, or every matching row except listed ones. */
export type SelectionState =
  | { readonly mode: "ids"; readonly ids: readonly string[] }
  | { readonly mode: "all"; readonly except: readonly string[] };

/** What a bulk action sends a server: the rows by id, or every matching row except some. */
export type SelectionTarget =
  | { readonly kind: "ids"; readonly ids: readonly string[] }
  | { readonly kind: "all"; readonly except: readonly string[] };

/** What `selection` takes. */
export interface SelectionOptions {
  /** Defaults to `"multi"`. */
  readonly mode?: SelectionMode;
  /** Defaults to `"all-only"`. */
  readonly resetOnRowsChange?: SelectionResetPolicy;
}

/** The selection commands, under `table.selection`. */
export interface SelectionApi {
  readonly mode: SelectionMode;
  /** Selects the row, or deselects it when it's selected. In single mode, selecting a row deselects the one before. */
  toggle(this: void, rowId: string): void;
  /** Selects or deselects the rows. In single mode, selecting keeps only the last id. */
  set(this: void, ids: readonly string[], selected: boolean): void;
  /** Selects every row that matches, loaded or not. Does nothing in single mode. */
  selectAllMatching(this: void): void;
  /** Deselects every row. */
  clear(this: void): void;
}

/** What a selectable column's cell gets from its adapter. */
export interface SelectionCellApi {
  readonly selected: boolean;
  readonly toggleSelected: () => void;
}

/** What a selectable column's header gets from its adapter. */
export interface SelectionHeaderApi {
  readonly checked: boolean;
  /** Some rows in scope are selected but not all. Never true with `checked`. */
  readonly indeterminate: boolean;
  readonly toggle: () => void;
}

/** Which rows a select-all checkbox covers: the rows shown, or every matching row. */
export type SelectionScope = "page" | "matching";

/** The config `selectable()` puts on a column. */
export interface SelectableConfig {
  readonly scope: SelectionScope;
}

type Options = SelectionOptions | undefined;

const none: readonly string[] = Object.freeze([]);
const empty: SelectionState = Object.freeze({ mode: "ids", ids: none });

const ofIds = (ids: readonly string[]): SelectionState =>
  ids.length === 0 ? empty : Object.freeze({ mode: "ids", ids: Object.freeze(ids) });
const ofAll = (except: readonly string[]): SelectionState => Object.freeze({ mode: "all", except: Object.freeze(except) });

// Sets of each state's ids, so per-row reads cost O(1) after the first.
const sets = new WeakMap<SelectionState, ReadonlySet<string>>();
const listed = (state: SelectionState): ReadonlySet<string> => {
  let set = sets.get(state);
  if (!set) {
    set = new Set(state.mode === "ids" ? state.ids : state.except);
    sets.set(state, set);
  }
  return set;
};

/** Whether a row is selected. */
export function isRowSelected(state: SelectionState, rowId: string): boolean {
  return listed(state).has(rowId) === (state.mode === "ids");
}

/** A selector for one row, for adapters that select from state: `isSelected("r1")(state)`. */
export const isSelected =
  (rowId: string) =>
  (state: SelectionState): boolean =>
    isRowSelected(state, rowId);

/** `list` plus `ids`, or `list` itself when it already has them all. */
const added = (list: readonly string[], ids: readonly string[]): readonly string[] => {
  const have = new Set(list);
  const extra: string[] = [];
  for (const id of ids) {
    if (have.has(id)) continue;
    have.add(id);
    extra.push(id);
  }
  return extra.length === 0 ? list : [...list, ...extra];
};

/** `list` without `ids`, or `list` itself when it has none of them. */
const removed = (list: readonly string[], ids: readonly string[]): readonly string[] => {
  const drop = new Set(ids);
  const kept = list.filter((id) => !drop.has(id));
  return kept.length === list.length ? list : kept;
};

/** Selects or deselects `ids` in multi mode, keeping `state` when nothing changes. */
const setMany = (state: SelectionState, ids: readonly string[], selected: boolean): SelectionState => {
  if (state.mode === "ids") {
    const next = selected ? added(state.ids, ids) : removed(state.ids, ids);
    return next === state.ids ? state : ofIds(next);
  }
  const next = selected ? removed(state.except, ids) : added(state.except, ids);
  return next === state.except ? state : ofAll(next);
};

const stateSeam: FeatureStateSeam<SelectionState, Options> = {
  initial: empty,
  keyed: "row",
  keyedRead: isRowSelected,
  rowsEffect: "none",
  onRowsEffect: (effect, state, ctx) => {
    if (effect !== "matching") return state;
    const policy = ctx.options?.resetOnRowsChange ?? "all-only";
    if (policy === "never" || state === empty) return state;
    if (policy === "all-only" && state.mode === "ids") return state;
    return empty;
  },
};

const api = (ctx: FeatureApiContext<"selection", SelectionState, Options>): SelectionApi => {
  const mode = ctx.options?.mode ?? "multi";
  const single = mode === "single";
  return {
    mode,
    toggle: (rowId) =>
      ctx.setState((prev) => {
        const on = isRowSelected(prev, rowId);
        if (single) return on ? empty : ofIds([rowId]);
        return setMany(prev, [rowId], !on);
      }),
    set: (ids, selected) =>
      ctx.setState((prev) => {
        if (!single) return setMany(prev, ids, selected);
        if (selected) {
          const last = ids[ids.length - 1];
          if (last === undefined) return prev;
          return prev.mode === "ids" && prev.ids.length === 1 && prev.ids[0] === last ? prev : ofIds([last]);
        }
        return ids.some((id) => isRowSelected(prev, id)) ? empty : prev;
      }),
    selectAllMatching: () => {
      if (single) return;
      ctx.setState((prev) => (prev.mode === "all" && prev.except.length === 0 ? prev : ofAll(none)));
    },
    clear: () => ctx.setState(empty),
  };
};

/**
 * Row selection, by id or as every matching row except some. Writes don't
 * run the row pipeline, and the feature adds nothing to the server request;
 * send `computeSelectionSummary(...).target` with a bulk action instead. A
 * write that changes the matching rows clears the selection as
 * `resetOnRowsChange` says.
 */
export const selection = /* @__PURE__ */ defineFeature({ name: "selection", state: stateSeam, api });

/**
 * A selection checkbox for a column: `defineColumn("select", { parts:
 * [selectable()] })`. A table with the column must install `selection`.
 * `scope` says what the header checkbox covers, the rows shown by default.
 */
export function selectable(options?: { readonly scope?: SelectionScope }): FeaturePart<"selection", SelectableConfig, SelectionCellApi> {
  return part<"selection", SelectableConfig, SelectionCellApi>(selection, Object.freeze({ scope: options?.scope ?? "page" }));
}

/** What a select-all checkbox shows. */
export interface SelectAllState {
  readonly checked: boolean;
  readonly indeterminate: boolean;
}

/**
 * Works out a select-all checkbox. For `"page"`, the default, it is checked
 * when there are rows in `visibleRowIds` and all are selected, and
 * indeterminate when some are. For `"matching"`, it is checked when every
 * matching row is selected with no exceptions and some rows show, and
 * indeterminate when any other selection exists.
 */
export function computeSelectAllState(
  state: SelectionState,
  visibleRowIds: readonly string[],
  scope: SelectionScope = "page",
): SelectAllState {
  if (scope === "matching") {
    const all = state.mode === "all" && state.except.length === 0 && visibleRowIds.length > 0;
    const some = state.mode === "all" ? state.except.length > 0 : state.ids.length > 0;
    return { checked: all, indeterminate: !all && some };
  }
  const count = countSelected(state, visibleRowIds);
  const checked = count > 0 && count === visibleRowIds.length;
  return { checked, indeterminate: count > 0 && !checked };
}

/** What a selection bar shows and a bulk action sends, from `computeSelectionSummary`. */
export interface SelectionSummary {
  /** How many rows are selected in all. Undefined in "all" mode without a total. */
  readonly count: number | undefined;
  /** How many of the shown rows are selected. */
  readonly visibleCount: number;
  /** The selected ids in "ids" mode; empty in "all" mode. */
  readonly ids: readonly string[];
  /** The deselected ids in "all" mode; empty in "ids" mode. */
  readonly except: readonly string[];
  readonly target: SelectionTarget;
}

const countSelected = (state: SelectionState, rowIds: readonly string[]) =>
  rowIds.reduce((n, id) => (isRowSelected(state, id) ? n + 1 : n), 0);

/**
 * Sums up a selection. In "all" mode, `count` is `totalCount` less the
 * exceptions, and undefined when `totalCount` is.
 */
export function computeSelectionSummary(state: SelectionState, visibleRowIds: readonly string[], totalCount?: number): SelectionSummary {
  const visibleCount = countSelected(state, visibleRowIds);
  if (state.mode === "ids") {
    return { count: state.ids.length, visibleCount, ids: state.ids, except: none, target: { kind: "ids", ids: state.ids } };
  }
  return {
    count: totalCount === undefined ? undefined : Math.max(0, totalCount - state.except.length),
    visibleCount,
    ids: none,
    except: state.except,
    target: { kind: "all", except: state.except },
  };
}
