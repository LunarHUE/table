import { describe, expect, it } from "vitest";
import { columnBuilder, defineColumn, defineColumns, withProps } from "./column.js";
import { defineFeature, part } from "./feature.js";
import { clientReference } from "./fixtures/client-reference.js";

interface User {
  readonly id: string;
  readonly name: string;
  readonly age: number;
}

const ada: User = { id: "u1", name: "Ada", age: 36 };
const Money = (props: { readonly value: number; readonly currency: string }) => `${props.value} ${props.currency}`;

describe("column helpers", () => {
  const col = columnBuilder<User>();

  it("makes a frozen key column that reads the field", () => {
    const name = col.key("name", { sortable: true, label: "Name", group: "person", meta: { align: "start" } });
    expect(name).toMatchObject({ id: "name", sortable: true, label: "Name", group: "person", meta: { align: "start" } });
    expect(name.getValue?.(ada)).toBe("Ada");
    expect(Object.isFrozen(name)).toBe(true);
    expect(col.key("age")).not.toHaveProperty("sortable");
  });

  it("makes an accessor column and a custom column", () => {
    const initials = col.accessor("initials", (row) => row.name.slice(0, 2));
    expect(initials.id).toBe("initials");
    expect(initials.getValue?.(ada)).toBe("Ad");
    const actions = col.custom("actions", { label: "" });
    expect(actions).toEqual({ id: "actions", label: "" });
    expect(Object.isFrozen(actions)).toBe(true);
  });

  it("keeps an option's id from replacing the column's", () => {
    // Options can't name an id in their type, but a spread object can carry one.
    const options: { readonly label: string } = Object.assign({ label: "Age" }, { id: "other" });
    expect(col.key("age", options).id).toBe("age");
  });

  it("makes a row-agnostic column with parts", () => {
    const selection = defineFeature({ name: "selection" });
    const selectable = part(selection, { mode: "multi" });
    const select = defineColumn("select", { parts: [selectable] });
    expect(select).toEqual({ id: "select", parts: [selectable] });
    expect(select.getValue).toBeUndefined();
    expect(Object.isFrozen(select)).toBe(true);
    expect(defineColumn("spacer")).toEqual({ id: "spacer" });
  });

  it("defines a frozen list of columns outside a table", () => {
    const columns = defineColumns<User>()((c) => [c.key("name"), c.custom("actions")]);
    expect(columns.map((column) => column.id)).toEqual(["name", "actions"]);
    expect(Object.isFrozen(columns)).toBe(true);
  });
});

describe("withProps", () => {
  it("binds props and lets the caller override them", () => {
    const Usd = withProps(Money, { currency: "USD" });
    expect(Usd({ value: 5 })).toBe("5 USD");
    expect(Usd({ value: 5, currency: "EUR" })).toBe("5 EUR");
  });
});

describe("client references", () => {
  it("never reads a cell, header or footer component", () => {
    const cell = clientReference();
    const header = clientReference();
    const footer = clientReference();
    const slots = { cell: cell.reference, header: header.reference, footer: footer.reference };
    const col = columnBuilder<User>();
    const columns = [
      defineColumn("select", slots),
      col.key("name", slots),
      col.accessor("initials", (row) => row.name.slice(0, 2), slots),
      col.custom("actions", slots),
      ...defineColumns<User>()((c) => [c.key("age", slots)]),
    ];
    const Bound = withProps(cell.reference, { format: "short" });
    for (const column of columns) {
      expect(column.cell === cell.reference).toBe(true);
      expect(column.header === header.reference).toBe(true);
      expect(column.footer === footer.reference).toBe(true);
    }
    expect(typeof Bound).toBe("function");
    expect([...cell.reads, ...header.reads, ...footer.reads]).toEqual([]);
  });
});
