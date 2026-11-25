import { expectTypeOf, it } from "vitest";
import {
  columnBuilder,
  defineColumn,
  defineColumns,
  withProps,
  type AnyColumn,
  type Column,
} from "./column.js";
import { defineFeature, part, type FeaturePart, type RequiredFeatureNames } from "./feature.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly age: number;
}
interface Order {
  readonly total: number;
}

const selection = defineFeature({ name: "selection", state: { initial: [] as readonly string[] } });
const selectable = () => part(selection, { mode: "multi" });
const col = columnBuilder<User>();
const Money = (props: { readonly value: number; readonly currency: string; readonly digits?: number }) =>
  `${props.value} ${props.currency} ${props.digits ?? 2}`;

it("types col.key by the row's field", () => {
  const name = col.key("name", { sortable: true });
  expectTypeOf(name).toEqualTypeOf<Column<User, "name", string, true, readonly []>>();
  expectTypeOf(col.key("age")).toEqualTypeOf<Column<User, "age", number, false, readonly []>>();
  expectTypeOf(name.getValue).toEqualTypeOf<((row: User) => string) | undefined>();
  // @ts-expect-error Users have no `total`.
  col.key("total");
});

it("types col.accessor by what it returns", () => {
  const initials = col.accessor("initials", (row) => row.name.slice(0, 2), { sortable: true });
  expectTypeOf(initials).toEqualTypeOf<Column<User, "initials", string, true, readonly []>>();
  expectTypeOf(col.accessor("adult", (row) => row.age >= 18)["~value"]).toEqualTypeOf<boolean | undefined>();
});

it("types col.custom and defineColumn with no value", () => {
  expectTypeOf(col.custom("actions")).toEqualTypeOf<Column<User, "actions", undefined, false, readonly []>>();
  const select = defineColumn("select", { parts: [selectable()], meta: { width: 40 } });
  expectTypeOf(select.id).toEqualTypeOf<"select">();
  expectTypeOf<NonNullable<typeof select.meta>>().toEqualTypeOf<{ readonly width: 40 }>();
  expectTypeOf<RequiredFeatureNames<NonNullable<typeof select.parts>>>().toEqualTypeOf<"selection">();
  expectTypeOf<NonNullable<typeof select.parts>>().toEqualTypeOf<
    readonly [FeaturePart<"selection", { mode: string }>]
  >();
});

it("fits a row-agnostic column into a table of any rows, and only matching rows otherwise", () => {
  const select = defineColumn("select");
  expectTypeOf(select).toExtend<Column<User, "select", undefined, false, readonly []>>();
  expectTypeOf(select).toExtend<AnyColumn<User>>();
  expectTypeOf(select).toExtend<AnyColumn<Order>>();
  expectTypeOf(col.key("name")).toExtend<AnyColumn<User>>();
  expectTypeOf(col.key("name")).toExtend<AnyColumn>();
  expectTypeOf(col.key("name")).not.toExtend<AnyColumn<Order>>();
  expectTypeOf(col.custom("actions")).not.toExtend<AnyColumn<Order>>();
  const dynamic: readonly AnyColumn<User>[] = [select, col.key("name"), col.custom("actions")];
  expectTypeOf(dynamic).toExtend<readonly AnyColumn[]>();
});

it("keeps defineColumns as a tuple of literal columns", () => {
  const columns = defineColumns<User>()((c) => [c.key("name"), c.accessor("double", (row) => row.age * 2)]);
  expectTypeOf(columns[0].id).toEqualTypeOf<"name">();
  expectTypeOf(columns[1].id).toEqualTypeOf<"double">();
  expectTypeOf(columns).toHaveProperty("length").toEqualTypeOf<2>();
});

it("types withProps as the component minus the bound props", () => {
  const Usd = withProps(Money, { currency: "USD" });
  expectTypeOf(Usd).parameter(0).toEqualTypeOf<
    Omit<{ readonly value: number; readonly currency: string; readonly digits?: number }, "currency"> & Partial<{ currency: string }>
  >();
  expectTypeOf(Usd).returns.toEqualTypeOf<string>();
  Usd({ value: 1 });
  Usd({ value: 1, currency: "EUR" });
  // @ts-expect-error `value` is still required.
  Usd({});
  // @ts-expect-error `Money` has no `locale`.
  withProps(Money, { locale: "en" });
});
