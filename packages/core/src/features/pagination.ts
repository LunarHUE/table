import type { StateUpdater } from "../bindings.js";
import { defineFeature, type FeatureApiContext, type FeatureStateSeam, type RowStage } from "../feature.js";

// Pagination comes in two features with one name, so a table installs one or
// the other. `pagination` cuts the page out of the rows in the browser.
// `remotePagination` cuts nothing and puts the page in the server request
// instead. Both keep the same state and API, so a pager component works with
// either.

/** How pages are addressed: by index, or by an opaque cursor the server hands out. */
export type PaginationMode = "offset" | "cursor";

/** The pagination slice of table state. */
export interface PaginationState {
  /** The page shown, from 0. */
  readonly pageIndex: number;
  /** Rows per page, at least 1. */
  readonly pageSize: number;
  /** The server's cursor for the page, in cursor mode. Null on the first page. */
  readonly cursor?: string | null;
}

/** What `pagination` and `remotePagination` take. */
export interface PaginationOptions {
  /** Allowed page sizes for UI pickers and URL validation. Defaults to `[10, 25, 50, 100]`. */
  readonly sizes?: readonly number[];
  /** Offset paging by default; `"cursor"` adds a cursor to the state and the request. */
  readonly mode?: PaginationMode;
}

/** The pagination commands, under `table.pagination`. */
export interface PaginationApi {
  /** The page sizes to offer, from the options. */
  readonly sizes: readonly number[];
  readonly mode: PaginationMode;
  /** Goes to a page. A negative or NaN index goes to 0, and a fraction is truncated. */
  setPage(this: void, index: StateUpdater<number>): void;
  /**
   * Sets the page size and goes back to the first page in the same write.
   * Sizes under 1 become 1, fractions are truncated, and NaN keeps the
   * current size. In cursor mode the cursor goes back to null too.
   */
  setPageSize(this: void, size: StateUpdater<number>): void;
  setCursor(this: void, cursor: string | null): void;
  /** Goes back to the state the table started with. */
  reset(this: void): void;
}

/** The part of a server request `remotePagination` owns. */
export type PaginationRequest = {
  readonly pageIndex: number;
  readonly pageSize: number;
  /** Set only when the state has a cursor, as in cursor mode. */
  readonly cursor?: string | null;
};

type Options = PaginationOptions | undefined;

const defaultSizes: readonly number[] = Object.freeze([10, 25, 50, 100]);
const defaultSize = 10;

const isIndex = (n: number) => Number.isInteger(n) && n >= 0;
const isSize = (n: number) => Number.isInteger(n) && n >= 1;
const toIndex = (n: number) => (Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0);
const toSize = (n: number, fallback: number) => (Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : fallback);

const resolveNumber = (updater: StateUpdater<number>, prev: number): number =>
  typeof updater === "function" ? updater(prev) : updater;

const stateSeam: FeatureStateSeam<PaginationState, Options> = {
  initial: (options) => ({ pageIndex: 0, pageSize: options?.sizes?.[0] ?? defaultSize }),
  rowsEffect: "view",
  normalize: (s) =>
    isIndex(s.pageIndex) && isSize(s.pageSize) ? s : { ...s, pageIndex: toIndex(s.pageIndex), pageSize: toSize(s.pageSize, defaultSize) },
  onRowsEffect: (effect, s) => {
    if (effect !== "matching") return s;
    const keepCursor = s.cursor === undefined || s.cursor === null;
    if (s.pageIndex === 0 && keepCursor) return s;
    return keepCursor ? { ...s, pageIndex: 0 } : { ...s, pageIndex: 0, cursor: null };
  },
};

const api = (ctx: FeatureApiContext<"pagination", PaginationState, Options>): PaginationApi => {
  const mode = ctx.options?.mode ?? "offset";
  return {
    sizes: ctx.options?.sizes ?? defaultSizes,
    mode,
    setPage: (index) =>
      ctx.setState((prev) => {
        const pageIndex = toIndex(resolveNumber(index, prev.pageIndex));
        return pageIndex === prev.pageIndex ? prev : { ...prev, pageIndex };
      }),
    setPageSize: (size) =>
      ctx.setState((prev) => {
        const pageSize = toSize(resolveNumber(size, prev.pageSize), prev.pageSize);
        const resetCursor = mode === "cursor" && prev.cursor !== null;
        if (pageSize === prev.pageSize && prev.pageIndex === 0 && !resetCursor) return prev;
        return resetCursor ? { ...prev, pageIndex: 0, pageSize, cursor: null } : { ...prev, pageIndex: 0, pageSize };
      }),
    setCursor: (cursor) => ctx.setState((prev) => (prev.cursor === cursor ? prev : { ...prev, cursor })),
    reset: () => ctx.setState(ctx.initial),
  };
};

const windowStage: RowStage<PaginationState, Options> = {
  phase: "window",
  reads: ["pagination"],
  run: (rows, ctx) => {
    const start = ctx.state.pageIndex * ctx.state.pageSize;
    return rows.slice(start, start + ctx.state.pageSize);
  },
};

/**
 * Client pagination: the window phase cuts the current page out of the rows
 * the table has. It adds nothing to the server request. A write that changes
 * the matching rows, such as a new filter, goes back to the first page.
 */
export const pagination = /* @__PURE__ */ defineFeature({ name: "pagination", state: stateSeam, api, rowStage: windowStage });

/**
 * Server pagination: puts `{ pageIndex, pageSize }`, and `cursor` when the
 * state has one, in the server request, and leaves the rows as the server
 * sent them. A write that changes the matching rows goes back to the first
 * page, and to a null cursor.
 */
export const remotePagination = /* @__PURE__ */ defineFeature({
  name: "pagination",
  state: stateSeam,
  api,
  request: (s: PaginationState): PaginationRequest =>
    s.cursor === undefined ? { pageIndex: s.pageIndex, pageSize: s.pageSize } : { pageIndex: s.pageIndex, pageSize: s.pageSize, cursor: s.cursor },
});

/** What a pager shows, from `computePaginationMeta`. */
export interface PaginationMeta {
  readonly pageIndex: number;
  readonly pageSize: number;
  /** 0 when nothing matches. */
  readonly pageCount: number;
  readonly totalCount: number;
  readonly canPrev: boolean;
  readonly canNext: boolean;
  readonly sizes: readonly number[];
  readonly cursor: string | null | undefined;
}

/**
 * Works out what a pager shows from the pagination state and how many rows
 * match in all. `pageCount` is `totalCount / pageSize` rounded up, and 0 when
 * `totalCount` is 0 or less. `canPrev` is true past the first page, even
 * when nothing matches, so a pager left on a page that emptied can go back.
 * `canNext` is true while a later page exists, so it is false when nothing
 * matches. `sizes` defaults to `[10, 25, 50, 100]`.
 */
export function computePaginationMeta(state: PaginationState, totalCount: number, sizes: readonly number[] = defaultSizes): PaginationMeta {
  const pageCount = totalCount <= 0 ? 0 : Math.ceil(totalCount / state.pageSize);
  return {
    pageIndex: state.pageIndex,
    pageSize: state.pageSize,
    pageCount,
    totalCount,
    canPrev: state.pageIndex > 0,
    canNext: state.pageIndex + 1 < pageCount,
    sizes,
    cursor: state.cursor,
  };
}
