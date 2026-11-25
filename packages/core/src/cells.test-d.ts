import { expectTypeOf, it } from "vitest";
import { cellKey, createCells, createKeyedCells, type Cell, type Cells, type KeyedScope, type KeyedStore } from "./cells.js";

it("types a cell's snapshot and `before`", () => {
  expectTypeOf<Cell<number>["snapshot"]>().toEqualTypeOf<number>();
  expectTypeOf<Cell<number>["before"]>().toEqualTypeOf<number | undefined>();
});

it("infers a keyed store's key and snapshot from `read`", () => {
  const rows = createKeyedCells(createCells(), (id: string) => id.length > 2);
  expectTypeOf(rows).toEqualTypeOf<KeyedStore<string, boolean>>();
  expectTypeOf(rows.get).returns.toEqualTypeOf<boolean>();
  const indexed = createKeyedCells(createCells(), (index: number) => `${index}`);
  expectTypeOf(indexed).toEqualTypeOf<KeyedStore<number, string>>();
  // @ts-expect-error the key is a number
  indexed.get("0");
});

it("names the three scopes and builds string cell keys", () => {
  expectTypeOf<KeyedScope>().toEqualTypeOf<"row" | "column" | "cell">();
  expectTypeOf(cellKey).toEqualTypeOf<(rowId: string, columnId: string) => string>();
});

it("types the cells tuple", () => {
  const [replace, , , batch] = createCells();
  expectTypeOf(createCells()).toEqualTypeOf<Cells>();
  expectTypeOf(batch(() => 1)).toEqualTypeOf<number>();
  const cell: Cell<string> = { snapshot: "", before: undefined, subscriptions: undefined };
  // @ts-expect-error the cell holds strings
  replace(cell, 1);
});
