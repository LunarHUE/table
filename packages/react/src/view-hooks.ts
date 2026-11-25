import {
  computePaginationMeta,
  computeSelectAllState,
  computeSelectionSummary,
  isFiltered,
  type PaginationApi,
  type PaginationMeta,
  type PaginationState,
  type Row,
  type SelectAllState,
  type SelectionApi,
  type SelectionScope,
  type SelectionState,
  type SelectionSummary,
} from "@lunarhue/table-core";
import { useMemo } from "react";
import { cached, useSelected, useSource, type Source } from "./select.js";
import { featureSource, noSource, storeOf, type AnyTable, type Store } from "./sources.js";

// Hooks that read state and something the app holds, such as the rows on
// screen or the total count, and return what a pager, a select-all checkbox
// or a selection bar shows. Every command they return takes no arguments, so
// it can go straight on `onClick` or `onChange`.

/** What `usePagination` returns: the pager's numbers and its commands. */
export interface PaginationControls extends PaginationMeta {
  /** Goes to the next page, unless this is the last. Ignores its arguments. */
  readonly next: () => void;
  /** Goes to the page before, unless this is the first. Ignores its arguments. */
  readonly prev: () => void;
  readonly setPage: PaginationApi["setPage"];
  readonly setPageSize: PaginationApi["setPageSize"];
  readonly setCursor: PaginationApi["setCursor"];
  readonly reset: PaginationApi["reset"];
}

/** Counts from a rows view that the pager and selection hooks read. */
export interface CountsView {
  readonly totalCount: number;
}

const firstPage: PaginationState = Object.freeze({ pageIndex: 0, pageSize: 10 });

/** A table with pagination. */
export type PaginatedTable = AnyTable & { readonly pagination: PaginationApi };

/** The pagination slice, as a table without one reads. */
const paginationOf = (state: unknown): PaginationState =>
  // A pagination table's slice is a `PaginationState`; the store hands it over untyped.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  state === undefined ? firstPage : (state as PaginationState);

/**
 * The pager for a paginated table: page, size, page count and whether there
 * is a page before or after, worked out from the state and `view.totalCount`.
 * `next` stops at the last page and `prev` at the first, and both work when
 * nothing matches.
 */
export function usePagination(table: PaginatedTable, view: CountsView): PaginationControls {
  const store = storeOf(table);
  const state = paginationOf(useSource(featureSource(store, "pagination")));
  const api = table.pagination;
  const { totalCount } = view;
  return useMemo(() => {
    const meta = computePaginationMeta(state, totalCount, api.sizes);
    const { pageCount } = meta;
    return {
      ...meta,
      next: () => api.setPage((index) => (index + 1 < pageCount ? index + 1 : index)),
      prev: () => api.setPage((index) => (index > 0 ? index - 1 : index)),
      setPage: api.setPage,
      setPageSize: api.setPageSize,
      setCursor: api.setCursor,
      reset: api.reset,
    };
  }, [state, totalCount, api]);
}

const noSelection: SelectionState = Object.freeze({ mode: "ids", ids: Object.freeze([]) });

/** The selection slice, as a table without one reads. */
const selectionOf = (state: unknown): SelectionState =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  state === undefined ? noSelection : (state as SelectionState);

const dataIds = (rows: readonly Row<unknown>[]): readonly string[] => rows.filter((row) => row.kind === "data").map((row) => row.id);

/** The selection source when `enabled`, and `noSource` otherwise. */
const selectionSource = (store: Store, enabled: boolean): Source<unknown> => (enabled ? featureSource(store, "selection") : noSource);

/** What `useSelectAll` returns. */
export interface SelectAllControls extends SelectAllState {
  /**
   * In `"page"` scope, selects every data row in `rows`, or deselects them
   * when all are selected. In `"matching"` scope, selects every matching row,
   * or clears the selection when all are selected. Ignores its arguments.
   */
  readonly toggle: () => void;
}

/** What `useSelectAll` takes besides the table and rows. */
export interface SelectAllOptions {
  /** Which rows the checkbox covers. Defaults to `"page"`, the rows given. */
  readonly scope?: SelectionScope;
}

/** A table with selection. */
export type SelectableTable = AnyTable & { readonly selection: SelectionApi };

/**
 * The select-all checkbox for a store. `enabled` false reads no state and
 * gives an unchecked box whose toggle does nothing, for a header whose column
 * has no selection part. It is a hook either way, so the header calls it on
 * every render.
 */
export function useSelectAllOf(
  store: Store,
  api: SelectionApi | undefined,
  rows: readonly Row<unknown>[],
  scope: SelectionScope,
): SelectAllControls {
  const state = selectionOf(useSource(selectionSource(store, api !== undefined)));
  return useMemo(() => {
    const ids = dataIds(rows);
    const { checked, indeterminate } = computeSelectAllState(state, ids, scope);
    const toggle = () => {
      if (!api) return;
      if (scope === "page") api.set(ids, !checked);
      else if (checked) api.clear();
      else api.selectAllMatching();
    };
    return { checked, indeterminate, toggle };
  }, [state, rows, scope, api]);
}

/** The select-all checkbox over `rows`, the rows a view shows. */
export function useSelectAll(table: SelectableTable, rows: readonly Row<unknown>[], options?: SelectAllOptions): SelectAllControls {
  return useSelectAllOf(storeOf(table), table.selection, rows, options?.scope ?? "page");
}

/**
 * What a selection bar shows and a bulk action sends: how many rows are
 * selected in all and on screen, and the target to send. In "all matching"
 * mode the count comes from `view.totalCount`.
 */
export function useSelection(table: SelectableTable, view: CountsView & { readonly rows: readonly Row<unknown>[] }): SelectionSummary {
  const state = selectionOf(useSource(featureSource(storeOf(table), "selection")));
  const { rows, totalCount } = view;
  return useMemo(() => computeSelectionSummary(state, dataIds(rows), totalCount), [state, rows, totalCount]);
}

const startingFilters = new WeakMap<Store, unknown>();

/** The filters the table started with, which `filtering.reset()` goes back to. */
const startOf = (store: Store): unknown =>
  cached(startingFilters, store, () => {
    const given: Readonly<Record<string, unknown>> = store.def.initialState;
    if (given["filtering"] !== undefined) return given["filtering"];
    const feature = store.def.resolvedFeatures.byName.get("filtering");
    const initial = feature?.def.state?.initial;
    return typeof initial === "function" ? Reflect.apply(initial, undefined, [feature?.options]) : initial;
  });

const isObject = (value: unknown): value is object => typeof value === "object" && value !== null;

/**
 * Whether the filters differ from those the table started with, as
 * `isFiltered` judges. `false` for a table without filtering, so a generic
 * toolbar can call it on any table.
 */
export function useIsFiltered(table: AnyTable): boolean {
  const store = storeOf(table);
  const start = startOf(store);
  return useSelected(featureSource(store, "filtering"), (filters) => isObject(filters) && isObject(start) && isFiltered(filters, start));
}
