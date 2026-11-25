import type { KeyboardEvent, MouseEvent } from "react";
import { expectTypeOf, it } from "vitest";
import {
  ariaSort,
  isInteractiveEvent,
  selectAllInputProps,
  selectInputProps,
  useRovingTabIndex,
  useRowLink,
  type CellPosition,
  type SortDir,
} from "./a11y.js";

it("types ariaSort", () => {
  expectTypeOf(ariaSort).parameter(0).toEqualTypeOf<SortDir>();
  expectTypeOf(ariaSort("asc")).toEqualTypeOf<"ascending" | "descending" | "none" | undefined>();
  // @ts-expect-error only the three directions
  ariaSort("up");
});

it("types the row link and the checkboxes for their elements", () => {
  expectTypeOf(isInteractiveEvent).returns.toEqualTypeOf<boolean>();
  const link = useRowLink((event) => {
    expectTypeOf(event).toEqualTypeOf<MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>>();
  });
  <tr {...link} />;
  const one = selectInputProps({ checked: false, toggle: () => {}, label: "x" });
  <input {...one} />;
  const all = selectAllInputProps({ checked: false, indeterminate: true, toggle: () => {}, label: "all" });
  expectTypeOf(all["aria-checked"]).toEqualTypeOf<boolean | "mixed">();
  <input {...all} />;
  // @ts-expect-error a label is required
  selectInputProps({ checked: false, toggle: () => {} });
});

it("types the roving tab index", () => {
  const grid = useRovingTabIndex({ rowCount: 2, colCount: 2 });
  expectTypeOf(grid.activeCell).toEqualTypeOf<CellPosition>();
  expectTypeOf(grid.getCellProps(0, 0).tabIndex).toEqualTypeOf<0 | -1>();
  <td {...grid.getCellProps(0, 0)} />;
});
