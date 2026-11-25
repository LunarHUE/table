import { defineFeature, defineTable, pagination, type RowLike } from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";

/** How many detail rows each expanded row has, by row id. */
export type Expanded = Readonly<Record<string, number>>;

export interface ExpandingApi {
  /** Expands a row with `count` detail rows, or collapses it when it's expanded. */
  toggle(this: void, rowId: string, count?: number): void;
}

/** A detail row's id: its parent's id and its number from 1. */
export const detailId = (parentId: string, n: number): string => `${parentId}~${String(n)}`;

const toggled = (expanded: Expanded, rowId: string, count: number): Expanded => {
  if (expanded[rowId] === undefined) return { ...expanded, [rowId]: count };
  const { [rowId]: _closed, ...rest } = expanded;
  return rest;
};

/**
 * A feature an app would write itself: a flatten stage that puts detail rows
 * under each expanded row. Pagination then pages by data rows and keeps the
 * details on their row's page.
 */
export const expanding = defineFeature<"expanding", void, Expanded, ExpandingApi>({
  name: "expanding",
  state: { initial: {} },
  api: (ctx) => ({
    toggle: (rowId, count = 2) => ctx.setState((expanded) => toggled(expanded, rowId, count)),
  }),
  rowStage: {
    phase: "flatten",
    run: (rows, ctx) =>
      rows.flatMap((row): RowLike[] => {
        const count = row.kind === "data" ? ctx.state[row.id] : undefined;
        if (count === undefined) return [row];
        const details = Array.from(
          { length: count },
          (_, i): RowLike => ({
            kind: "detail",
            id: detailId(row.id, i + 1),
            index: row.index,
            depth: 1,
            parentId: row.id,
            original: row.original,
          }),
        );
        return [row, ...details];
      }),
  },
});

/** Three data rows a page. The first person starts expanded. */
export const detailRowsTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [col.key("name", { label: "Name" }), col.key("city", { label: "City" })],
  features: [expanding(), pagination({ sizes: [3] })],
  initialState: { expanding: { p1: 2 } },
});

/** The text a detail row shows. */
export const detailText = (name: string, n: number): string => `Detail ${String(n)} for ${name}`;

/** The counts line under the table. */
export const countsText = (matching: number, total: number, pages: number): string =>
  `Matching ${String(matching)}, total ${String(total)}, pages ${String(pages)}`;

export const detailRowsScenario = scenario("detail-rows", "Detail rows", {
  rows: namesOf(people.slice(0, 3)),
  texts: [detailText("Grace Hopper", 1), detailText("Grace Hopper", 2), countsText(12, 12, 4)],
});
