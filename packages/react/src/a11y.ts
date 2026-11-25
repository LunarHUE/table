// The ./a11y entry: props and handlers for accessible table markup. Nothing
// here reads the table store, so these work with the main entry, ./mini or a
// hand-rolled table. Core is imported for its types only.
import type { SortDir } from "@lunarhue/table-core";
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { useId } from "#lunarhue/react";

export type { SortDir };

/** The `aria-sort` value of a sortable header. */
export type AriaSort = "ascending" | "descending" | "none";

/**
 * The `aria-sort` value for a column sorted in `dir`. An unsorted column
 * gets `"none"`, or `undefined` with `includeNone: false`, which leaves the
 * attribute off. Put it on the `<th>`, not on the button inside it.
 */
export function ariaSort(dir: SortDir, options?: { readonly includeNone?: boolean }): AriaSort | undefined {
  if (dir === "asc") return "ascending";
  if (dir === "desc") return "descending";
  return options?.includeNone === false ? undefined : "none";
}

const interactive =
  'a[href],button,input,select,textarea,summary,label,[contenteditable=""],[contenteditable="true"],[role="button"],[role="link"],[role="checkbox"],[role="menuitem"],[role="option"],[role="switch"],[role="tab"],[data-table-interactive]';

/** The two targets of an event, as React's and the DOM's events both carry them. */
export interface EventTargets {
  readonly target: EventTarget | null;
  readonly currentTarget: EventTarget | null;
}

/**
 * Whether an event on a row or cell came from something that handles it
 * itself: a link, a button, a form control, an element with an interactive
 * role or `data-table-interactive`, between the target and `currentTarget`.
 *
 * It is also true when the target sits outside `currentTarget` in the DOM.
 * React bubbles events from a portal through the component tree, so a click
 * in a dropdown menu that a cell renders into `document.body` reaches the
 * row's `onClick`, though the row never contained it.
 */
export function isInteractiveEvent({ target, currentTarget }: EventTargets): boolean {
  if (!(target instanceof Element) || !(currentTarget instanceof Node) || !currentTarget.contains(target)) return true;
  const hit = target.closest(interactive);
  return hit !== null && hit !== currentTarget && currentTarget.contains(hit);
}

/** What `useRowLink` returns, to spread on a `<tr>`. */
export interface RowLinkProps {
  readonly tabIndex: number | undefined;
  readonly onClick: (event: MouseEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

const modified = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>): boolean =>
  event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || isInteractiveEvent(event);

/**
 * Props that make a whole row open something: a plain left click anywhere
 * in it, or Enter or Space while it has focus. Clicks with a modifier key,
 * clicks that end a text selection, and events from interactive elements in
 * the row (see `isInteractiveEvent`) are left alone. Keep a real link in the
 * row too, so the row's target can be opened in a new tab.
 */
export function useRowLink(
  onNavigate: (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => void,
  options?: { readonly disabled?: boolean },
): RowLinkProps {
  const disabled = options?.disabled === true;
  return {
    tabIndex: disabled ? undefined : 0,
    onClick: (event) => {
      if (disabled || event.button !== 0 || modified(event)) return;
      // A drag that selects text ends in a click too.
      if (globalThis.getSelection?.()?.isCollapsed === false) return;
      onNavigate(event);
    },
    onKeyDown: (event) => {
      if (disabled || (event.key !== "Enter" && event.key !== " ") || modified(event)) return;
      // Space would scroll the page.
      event.preventDefault();
      onNavigate(event);
    },
  };
}

/** What `selectInputProps` takes. */
export interface SelectInputOptions {
  readonly checked: boolean;
  /** Called with no arguments. */
  readonly toggle: () => void;
  /** The checkbox's accessible name, such as "Select Ada". */
  readonly label: string;
  readonly disabled?: boolean;
}

/** Props for a row's selection checkbox. */
export interface SelectInputProps {
  readonly type: "checkbox";
  readonly checked: boolean;
  readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly "aria-label": string;
  readonly disabled: boolean;
}

/** Props for a row's selection checkbox. `onChange` calls `toggle` with no arguments. */
export function selectInputProps({ checked, toggle, label, disabled = false }: SelectInputOptions): SelectInputProps {
  return { type: "checkbox", checked, onChange: () => toggle(), "aria-label": label, disabled };
}

/** What `selectAllInputProps` takes. */
export interface SelectAllInputOptions extends SelectInputOptions {
  /** Some rows are selected but not all. */
  readonly indeterminate: boolean;
}

/** Props for a select-all checkbox. */
export interface SelectAllInputProps extends SelectInputProps {
  readonly "aria-checked": boolean | "mixed";
  readonly ref: (element: HTMLInputElement | null) => void;
}

/**
 * Props for a select-all checkbox. `indeterminate` is a DOM property with
 * no attribute, so a callback ref sets it. A click clears it in the browser
 * before React sees the change, and when the click leaves the state
 * indeterminate the props don't change, so a memoized ref never runs again.
 * `onChange` puts the value back for that case.
 */
export function selectAllInputProps({ indeterminate, ...options }: SelectAllInputOptions): SelectAllInputProps {
  const props = selectInputProps(options);
  return {
    ...props,
    "aria-checked": indeterminate ? "mixed" : options.checked,
    onChange: (event) => {
      event.currentTarget.indeterminate = indeterminate;
      props.onChange(event);
    },
    ref: (element) => {
      if (element) element.indeterminate = indeterminate;
    },
  };
}

/** A cell's position: row and column, both from 0. */
export interface CellPosition {
  readonly row: number;
  readonly col: number;
}

/** What `useRovingTabIndex` takes. */
export interface RovingTabIndexOptions {
  readonly rowCount: number;
  readonly colCount: number;
  /** Arrow keys wrap around at the edges instead of stopping. Default `false`. */
  readonly loop?: boolean;
}

/** Props for one cell of a roving grid. */
export interface RovingCellProps {
  readonly id: string;
  readonly tabIndex: 0 | -1;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  readonly onFocus: () => void;
}

/** What `useRovingTabIndex` returns. */
export interface RovingTabIndex {
  readonly activeCell: CellPosition;
  readonly getCellProps: (row: number, col: number) => RovingCellProps;
  readonly setActiveCell: (row: number, col: number) => void;
}

const clamp = (value: number, count: number): number => Math.max(0, Math.min(value, count - 1));

/**
 * One tab stop for a grid of cells. The active cell has `tabIndex` 0 and the
 * rest -1. Arrow keys move one cell, Home and End go to the ends of the row,
 * and with Ctrl to the first and last cell of the grid. A cell that gets
 * focus some other way, such as a click, becomes the active one. Keys from
 * elements inside a cell, such as an input, are left alone.
 */
export function useRovingTabIndex(options: RovingTabIndexOptions): RovingTabIndex {
  const { rowCount, colCount } = options;
  const loop = options.loop === true;
  const base = useId();
  const [cell, setCell] = useState<CellPosition>({ row: 0, col: 0 });
  // Clamped here and not in state, so the cell follows when rows go away.
  const activeCell: CellPosition = { row: clamp(cell.row, rowCount), col: clamp(cell.col, colCount) };
  const cellId = (row: number, col: number): string => `${base}-${row}-${col}`;
  const step = (value: number, by: number, count: number): number =>
    loop ? (value + by + count) % count : clamp(value + by, count);
  const setActiveCell = (row: number, col: number): void => setCell({ row: clamp(row, rowCount), col: clamp(col, colCount) });

  const move = (event: KeyboardEvent<HTMLElement>, row: number, col: number): void => {
    if (event.target !== event.currentTarget || event.defaultPrevented || event.altKey || event.metaKey) return;
    const ctrl = event.ctrlKey;
    let next: readonly [number, number] | undefined;
    if (event.key === "ArrowUp") next = [step(row, -1, rowCount), col];
    else if (event.key === "ArrowDown") next = [step(row, 1, rowCount), col];
    else if (event.key === "ArrowLeft") next = [row, step(col, -1, colCount)];
    else if (event.key === "ArrowRight") next = [row, step(col, 1, colCount)];
    else if (event.key === "Home") next = [ctrl ? 0 : row, 0];
    else if (event.key === "End") next = [ctrl ? rowCount - 1 : row, colCount - 1];
    if (!next) return;
    event.preventDefault();
    const [r, c] = next;
    setActiveCell(r, c);
    const root = event.currentTarget.getRootNode();
    if (root instanceof Document || root instanceof DocumentFragment) root.getElementById(cellId(r, c))?.focus();
  };

  return {
    activeCell,
    setActiveCell,
    getCellProps: (row, col) => ({
      id: cellId(row, col),
      tabIndex: row === activeCell.row && col === activeCell.col ? 0 : -1,
      onKeyDown: (event) => move(event, row, col),
      onFocus: () => setActiveCell(row, col),
    }),
  };
}
