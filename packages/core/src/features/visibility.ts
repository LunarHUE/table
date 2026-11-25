import type { ColumnId, ColumnInfo, ColumnViewInfo, ColumnZone } from "../contract.js";
import { defineFeature, type FeatureApiContext } from "../feature.js";

// Two client-only column features. `visibility()` hides columns and nothing
// else. `columnLayout()` hides, orders, pins and sizes them, for a table
// with a column menu or resizable headers. Neither sends anything to the
// server or touches the rows: their writes have rows effect `"none"`, so
// the row pipeline and features like pagination never hear about them.
// Both drop ids of columns the table no longer has, so a layout saved in
// `localStorage` before a column was removed still loads.

/** The hidden columns. */
export interface VisibilityState {
  readonly hidden: readonly ColumnId[];
}

/** The commands at `table.visibility`. */
export interface VisibilityApi {
  /** Hides a shown column, or shows a hidden one. */
  toggle(this: void, id: ColumnId): void;
  set(this: void, id: ColumnId, visible: boolean): void;
  /** Replaces the hidden list. */
  setHidden(this: void, hidden: readonly ColumnId[]): void;
  showAll(this: void): void;
  /** Goes back to the state the table started with. */
  reset(this: void): void;
}

/** The columns pinned to each side. A column in both lists is pinned to the start. */
export interface ColumnPinnedState {
  readonly start: readonly ColumnId[];
  readonly end: readonly ColumnId[];
}

/** A column layout, as an app would save it. */
export interface ColumnLayoutState {
  readonly hidden: readonly ColumnId[];
  /** Columns listed here come first, in this order. The rest follow in the order the table defines them. */
  readonly order: readonly ColumnId[];
  readonly pinned: ColumnPinnedState;
  /** Widths in pixels, by column id. */
  readonly sizes: Readonly<Record<string, number>>;
}

/** The commands at `table.columnLayout`. */
export interface ColumnLayoutApi {
  setVisible(this: void, id: ColumnId, visible: boolean): void;
  toggleVisible(this: void, id: ColumnId): void;
  showAll(this: void): void;
  /** Replaces the order list. Columns left out follow the listed ones. */
  setOrder(this: void, order: readonly ColumnId[]): void;
  /** Moves a column to `toIndex` among all the table's columns, hidden ones included. */
  moveColumn(this: void, id: ColumnId, toIndex: number): void;
  /** Pins a column to the start or the end, or unpins it with `"center"`. */
  pin(this: void, id: ColumnId, zone: ColumnZone): void;
  /** Sets a column's width in pixels. `undefined`, or a width that isn't a positive finite number, removes it. */
  setSize(this: void, id: ColumnId, width: number | undefined): void;
  /** Goes back to the state the table started with. */
  reset(this: void): void;
}

/** Whether a column is shown in `state`. Works for both features' state. */
export const isColumnVisible = (state: { readonly hidden: readonly string[] }, columnId: string): boolean =>
  !state.hidden.includes(columnId);

/** A selector of whether one column is shown, for a column subscription. */
export const columnVisible =
  (columnId: string) =>
  (state: { readonly hidden: readonly string[] }): boolean =>
    isColumnVisible(state, columnId);

/**
 * CSS custom properties for the columns' widths: `--col-<id>-size: <size>px`
 * for each column with a size. Put them on the table's container, as
 * `style={columnSizeVars(visibleColumns)}`, and have cells read
 * `var(--col-<id>-size)`, so a resize restyles one element and no cell reads
 * a width in JS. Column ids must be valid in a CSS custom property name.
 */
export function columnSizeVars(columns: readonly ColumnViewInfo[]): Readonly<Record<string, string>> {
  const vars: Record<string, string> = {};
  for (const column of columns) {
    if (column.size !== undefined) vars[`--col-${column.id}-size`] = `${column.size}px`;
  }
  return Object.freeze(vars);
}

const none: readonly ColumnId[] = Object.freeze([]);

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

const validSize = (width: unknown): width is number => typeof width === "number" && Number.isFinite(width) && width > 0;

const columnIds = (columns: readonly ColumnInfo[]): ReadonlySet<string> => new Set(columns.map((column) => column.id));

/** `ids` without unknown, duplicate or `skip`ped ids. Returns `ids` itself when nothing goes. */
const keepKnown = (ids: readonly ColumnId[], known: ReadonlySet<string>, skip?: ReadonlySet<string>): readonly ColumnId[] => {
  const seen = new Set<string>();
  const kept = ids.filter((id) => {
    if (!known.has(id) || seen.has(id) || skip?.has(id)) return false;
    seen.add(id);
    return true;
  });
  return kept.length === ids.length ? ids : kept;
};

/** `ids` with `id` in it when `include`, or without it. Returns `ids` itself when nothing changes. */
const withId = (ids: readonly ColumnId[], id: ColumnId, include: boolean): readonly ColumnId[] => {
  const has = ids.includes(id);
  if (has === include) return ids;
  return include ? [...ids, id] : ids.filter((item) => item !== id);
};

/** `columns` with the `hidden` ones set to not visible. Returns `columns` itself when nothing changes. */
const hide = (columns: readonly ColumnViewInfo[], hidden: readonly string[]): readonly ColumnViewInfo[] => {
  if (hidden.length === 0) return columns;
  const set = new Set(hidden);
  let changed = false;
  const next = columns.map((column) => {
    if (!column.visible || !set.has(column.id)) return column;
    changed = true;
    return { ...column, visible: false };
  });
  return changed ? next : columns;
};

const visibilityApi = (ctx: FeatureApiContext<"visibility", VisibilityState, void>): VisibilityApi => {
  const set = (id: ColumnId, visible: boolean) =>
    ctx.setState((prev) => {
      const hidden = withId(prev.hidden, id, !visible);
      return hidden === prev.hidden ? prev : { hidden };
    });
  return {
    toggle: (id) => set(id, !isColumnVisible(ctx.getState(), id)),
    set,
    setHidden: (hidden) => ctx.setState({ hidden }),
    showAll: () => ctx.setState((prev) => (prev.hidden.length === 0 ? prev : { hidden: none })),
    reset: () => ctx.setState(ctx.initial),
  };
};

/** Hides columns in the browser. Writes never re-run the row pipeline. */
export const visibility = /* @__PURE__ */ defineFeature<"visibility", void, VisibilityState, VisibilityApi>({
  name: "visibility",
  state: {
    initial: Object.freeze({ hidden: none }),
    keyed: "column",
    // A boolean, so hiding one column wakes that column's listeners only.
    keyedRead: isColumnVisible,
    rowsEffect: "none",
    normalize: (state, columns) => {
      const hidden = keepKnown(state.hidden, columnIds(columns));
      return hidden === state.hidden ? state : { hidden };
    },
  },
  api: visibilityApi,
  columnStage: (columns, state) => hide(columns, state.hidden),
});

const noSizes: Readonly<Record<string, number>> = Object.freeze({});

const emptyLayout: ColumnLayoutState = Object.freeze({
  hidden: none,
  order: none,
  pinned: Object.freeze({ start: none, end: none }),
  sizes: noSizes,
});

/** The zone `state` pins a column to. */
const zoneOf = (state: ColumnLayoutState, columnId: string): ColumnZone =>
  state.pinned.start.includes(columnId) ? "start" : state.pinned.end.includes(columnId) ? "end" : "center";

/**
 * One column's slice of a layout, as a string: whether it shows, its zone
 * and its width. Equal strings are equal by `Object.is`, so a write wakes
 * only the columns whose slice changed. Order isn't in it: moving one
 * column shifts the others, so order is read from `getColumns()`.
 */
const layoutKey = (state: ColumnLayoutState, columnId: string): string => {
  const size = hasOwn(state.sizes, columnId) ? state.sizes[columnId] : undefined;
  return `${isColumnVisible(state, columnId) ? 1 : 0}:${zoneOf(state, columnId)}:${size ?? ""}`;
};

const normalizeLayout = (state: ColumnLayoutState, columns: readonly ColumnInfo[]): ColumnLayoutState => {
  const known = columnIds(columns);
  const hidden = keepKnown(state.hidden, known);
  const order = keepKnown(state.order, known);
  const start = keepKnown(state.pinned.start, known);
  const end = keepKnown(state.pinned.end, known, new Set(start));
  const keys = Object.keys(state.sizes);
  const goodKeys = keys.filter((id) => known.has(id) && validSize(state.sizes[id]));
  let sizes = state.sizes;
  if (goodKeys.length !== keys.length) {
    const kept: Record<string, number> = {};
    for (const id of goodKeys) kept[id] = state.sizes[id] ?? 0;
    sizes = kept;
  }
  const pinned = start === state.pinned.start && end === state.pinned.end ? state.pinned : { start, end };
  const same = hidden === state.hidden && order === state.order && pinned === state.pinned && sizes === state.sizes;
  return same ? state : { hidden, order, pinned, sizes };
};

/** `columns` in layout order: those in `order` first, then the rest in the order they came. */
const inOrder = <C extends ColumnInfo>(columns: readonly C[], order: readonly string[]): readonly C[] => {
  if (order.length === 0) return columns;
  const byId = new Map(columns.map((column) => [column.id, column]));
  const listed = order.flatMap((id) => byId.get(id) ?? []);
  const placed = new Set(listed);
  return [...listed, ...columns.filter((column) => !placed.has(column))];
};

const layoutApi = (ctx: FeatureApiContext<"columnLayout", ColumnLayoutState, void>): ColumnLayoutApi => {
  const setVisible = (id: ColumnId, visible: boolean) =>
    ctx.setState((prev) => {
      const hidden = withId(prev.hidden, id, !visible);
      return hidden === prev.hidden ? prev : { ...prev, hidden };
    });
  return {
    setVisible,
    toggleVisible: (id) => setVisible(id, !isColumnVisible(ctx.getState(), id)),
    showAll: () => ctx.setState((prev) => (prev.hidden.length === 0 ? prev : { ...prev, hidden: none })),
    setOrder: (order) => ctx.setState((prev) => ({ ...prev, order })),
    moveColumn: (id, toIndex) =>
      ctx.setState((prev) => {
        const ids = inOrder(ctx.columns(), prev.order).map((column) => column.id);
        const from = ids.indexOf(id);
        const to = Math.max(0, Math.min(ids.length - 1, Math.trunc(toIndex) || 0));
        if (from === -1 || from === to) return prev;
        ids.splice(from, 1);
        ids.splice(to, 0, id);
        return { ...prev, order: ids };
      }),
    pin: (id, zone) =>
      ctx.setState((prev) => {
        const start = withId(prev.pinned.start, id, zone === "start");
        const end = withId(prev.pinned.end, id, zone === "end");
        return start === prev.pinned.start && end === prev.pinned.end ? prev : { ...prev, pinned: { start, end } };
      }),
    setSize: (id, width) =>
      ctx.setState((prev) => {
        const had = hasOwn(prev.sizes, id);
        if (!validSize(width)) {
          if (!had) return prev;
          const sizes = { ...prev.sizes };
          delete sizes[id];
          return { ...prev, sizes };
        }
        return had && prev.sizes[id] === width ? prev : { ...prev, sizes: { ...prev.sizes, [id]: width } };
      }),
    reset: () => ctx.setState(ctx.initial),
  };
};

/**
 * Orders, hides, pins and sizes the columns. Pinned columns come first in
 * their zone's list order, so `pinned.start` is the order of the start
 * zone. Returns `columns` itself when nothing changes, and keeps each
 * unchanged column object.
 */
const layoutColumns = (columns: readonly ColumnViewInfo[], state: ColumnLayoutState): readonly ColumnViewInfo[] => {
  const { pinned } = state;
  const byId = new Map(columns.map((column) => [column.id, column]));
  const start = new Set(pinned.start);
  const end = new Set(pinned.end);
  const hidden = new Set(state.hidden);
  const sequence = [
    ...pinned.start.flatMap((id) => byId.get(id) ?? []),
    ...inOrder(columns, state.order).filter((column) => !start.has(column.id) && !end.has(column.id)),
    ...pinned.end.flatMap((id) => (start.has(id) ? [] : (byId.get(id) ?? []))),
  ];
  let changed = false;
  const next = sequence.map((column, i): ColumnViewInfo => {
    const { id } = column;
    const visible = column.visible && !hidden.has(id);
    const zone: ColumnZone = start.has(id) ? "start" : end.has(id) ? "end" : column.zone;
    const size = hasOwn(state.sizes, id) ? state.sizes[id] : column.size;
    if (column !== columns[i]) changed = true;
    if (visible === column.visible && zone === column.zone && size === column.size) return column;
    changed = true;
    return size === undefined ? { ...column, visible, zone } : { ...column, visible, zone, size };
  });
  return changed ? next : columns;
};

/** A full column layout: hidden columns, order, start and end pinning, and widths. Writes never re-run the row pipeline. */
export const columnLayout = /* @__PURE__ */ defineFeature<"columnLayout", void, ColumnLayoutState, ColumnLayoutApi>({
  name: "columnLayout",
  state: {
    initial: emptyLayout,
    keyed: "column",
    keyedRead: layoutKey,
    rowsEffect: "none",
    normalize: normalizeLayout,
  },
  api: layoutApi,
  columnStage: layoutColumns,
});

/** The feature `visibility()` makes. */
export type VisibilityFeature = ReturnType<typeof visibility>;
/** The feature `columnLayout()` makes. */
export type ColumnLayoutFeature = ReturnType<typeof columnLayout>;
