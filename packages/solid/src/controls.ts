import {
  computePaginationMeta,
  computeSelectAllState,
  computeSelectionSummary,
  isFiltered,
  stepPage,
  type InitialState,
  type PaginationApi,
  type PaginationMeta,
  type PaginationState,
  type Row,
  type SelectAllState,
  type SelectionApi,
  type SelectionScope,
  type SelectionState,
  type SelectionSummary,
  type TableRowsView,
} from "@lunarhue/table-core";
import { untrack, type Accessor } from "solid-js";
import { createFeatureState } from "./table.js";
import { derived, isStateful, storeOf, type AnyTable } from "./store.js";

// The primitives that need the rows as well as the table: a pager needs the
// row count, and a select-all checkbox needs the ids shown. Each command
// they return takes no arguments, so it can go straight into `onClick`.

/** A table with pagination. */
export type PaginationTable = AnyTable & { readonly pagination: PaginationApi };

/** A table with selection. */
export type SelectionTable = AnyTable & { readonly selection: SelectionApi };

/** What `createPagination` returns: the pager's numbers as getters, and its commands. */
export interface PaginationControls extends PaginationMeta {
  /** Goes to the next page, when there is one. */
  readonly next: () => void;
  /** Goes to the previous page, when there is one. */
  readonly prev: () => void;
  readonly setPage: PaginationApi["setPage"];
  readonly setPageSize: PaginationApi["setPageSize"];
  readonly setCursor: PaginationApi["setCursor"];
  readonly reset: PaginationApi["reset"];
}

const metaKeys = ["pageIndex", "pageSize", "pageCount", "totalCount", "canPrev", "canNext", "sizes", "cursor"] as const;

/**
 * A pager for `view`. Each number is a getter over one memo, so reading
 * `pager.pageIndex` in JSX follows it. The commands never change, so
 * destructuring them is fine; destructuring a number reads it once. With
 * client `pagination()`, a page past the last one reads as the last page,
 * which is what the rows show, and `prev` and `next` step from there.
 */
export function createPagination(table: PaginationTable, view: Accessor<TableRowsView<unknown>>): PaginationControls {
  const api = table.pagination;
  // The table has pagination, whose state is `PaginationState`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = createFeatureState(table, "pagination") as Accessor<PaginationState>;
  // Client `pagination()` cuts the page out of the rows itself, clamped to the last page.
  const clamp = storeOf(table).def.resolvedFeatures.byName.get("pagination")?.def.rowStage !== undefined;
  const meta = derived(() => computePaginationMeta(state(), view().totalCount, api.sizes, clamp));
  const step = (by: 1 | -1) => {
    const { pageCount } = untrack(meta);
    api.setPage((index) => stepPage(index, pageCount, by, clamp));
  };
  const controls = {
    next: () => step(1),
    prev: () => step(-1),
    setPage: api.setPage,
    setPageSize: api.setPageSize,
    setCursor: api.setCursor,
    reset: api.reset,
  };
  for (const key of metaKeys) Object.defineProperty(controls, key, { enumerable: true, get: () => meta()[key] });
  // The loop above adds a getter for every member of `PaginationMeta`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return controls as PaginationControls;
}

/** What `createSelectAll` gives: the checkbox's state, and the command that flips it. */
export interface SelectAllControls extends SelectAllState {
  /** Selects every row in scope, or deselects them when all are selected. */
  readonly toggle: () => void;
}

/** What `createSelectAll` takes besides the rows. */
export interface SelectAllOptions {
  /** The rows shown (`"page"`, the default), or every matching row. */
  readonly scope?: SelectionScope;
}

const idsOf = (rows: readonly Row<unknown>[]): readonly string[] => rows.filter((row) => row.kind === "data").map((row) => row.id);

/**
 * A select-all checkbox over `rows`, as an accessor. `toggle` is the same
 * function every time, and reads the selection when it's called. In
 * `"matching"` scope it selects every matching row, loaded or not, and
 * clears the selection when that is what's selected.
 */
export function createSelectAll(
  table: SelectionTable,
  rows: Accessor<readonly Row<unknown>[]>,
  options?: SelectAllOptions,
): Accessor<SelectAllControls> {
  const api = table.selection;
  // The table has selection, whose state is `SelectionState`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const selection = createFeatureState(table, "selection") as Accessor<SelectionState>;
  const ids = derived(() => idsOf(rows()));
  const scope = () => options?.scope ?? "page";
  const state = derived(() => computeSelectAllState(selection(), ids(), scope()));
  const toggle = () => {
    const matching = untrack(scope) === "matching";
    if (untrack(state).checked) {
      if (matching) api.clear();
      else api.set(untrack(ids), false);
    } else if (matching) api.selectAllMatching();
    else api.set(untrack(ids), true);
  };
  return derived(() => ({ ...state(), toggle }));
}

/** What a selection bar shows for `view`, as an accessor: counts, ids, and the target to send a bulk action. */
export function createSelection(table: SelectionTable, view: Accessor<TableRowsView<unknown>>): Accessor<SelectionSummary> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const selection = createFeatureState(table, "selection") as Accessor<SelectionState>;
  return derived(() => {
    const current = view();
    return computeSelectionSummary(selection(), idsOf(current.rows), current.totalCount);
  });
}

const no = (): boolean => false;

/** The filters a table started with: `initialState.filtering`, or the feature's own `initial`. */
function startingFilters(table: AnyTable): object {
  const def = storeOf(table).def;
  // `initialState` is keyed by feature name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const given = (def.initialState as Readonly<Record<string, unknown>>)["filtering"];
  if (typeof given === "object" && given !== null) return given;
  const feature = def.resolvedFeatures.byName.get("filtering");
  const initial = feature?.def.state?.initial;
  // A function `initial` makes the state from the options, as the store calls it.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const start = typeof initial === "function" ? (initial as InitialState<unknown, unknown>)(feature?.options) : initial;
  return typeof start === "object" && start !== null ? start : {};
}

/**
 * Whether the table's filters differ from the filters it started with, as
 * `isFiltered` compares them. A table without filtering gives `false`.
 */
export function createIsFiltered(table: AnyTable): Accessor<boolean> {
  if (!isStateful(storeOf(table), "filtering")) return no;
  const baseline = startingFilters(table);
  // The filtering state is an object of filters.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const filters = createFeatureState(table, "filtering") as Accessor<object>;
  return derived(() => isFiltered(filters(), baseline));
}
