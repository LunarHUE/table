import { expectTypeOf, it } from "vitest";
import { ariaSort } from "./a11y.js";
import { useSimpleTable, type SimpleColumn, type SimpleRow, type SimpleSort } from "./mini.js";

interface User {
  readonly id: string;
  readonly name: string;
}

it("types columns against the row", () => {
  const ok: SimpleColumn<User, "name"> = { id: "name", accessor: "name", compare: (a, b) => a.name.localeCompare(b.name) };
  expectTypeOf(ok.id).toEqualTypeOf<"name">();
  // @ts-expect-error accessor keys come from the row
  const bad: SimpleColumn<User> = { id: "x", accessor: "missing" };
  void bad;
});

it("infers the row from data", () => {
  const users: readonly User[] = [];
  const t = useSimpleTable({ data: users, columns: [{ id: "name", accessor: (u) => u.name.length }] });
  expectTypeOf(t.rows).toEqualTypeOf<readonly SimpleRow<User>[]>();
  expectTypeOf(t.sort).toEqualTypeOf<SimpleSort>();
  expectTypeOf(t.pageSize).toEqualTypeOf<number | undefined>();
  expectTypeOf(t.toggleAll).toEqualTypeOf<() => void>();
  expectTypeOf(ariaSort(t.sortDir("name"))).toEqualTypeOf<"ascending" | "descending" | "none" | undefined>();
  // @ts-expect-error getRowId returns a string
  useSimpleTable({ data: users, columns: [], getRowId: (u) => u.name.length });
});
