import { defineTable, pagination } from "@lunarhue/table-core";
import { type Item, itemsUpTo, namesOf } from "../data.js";
import { scenario } from "../scenario.js";

/** How many items the page starts with, and how many "Keep 7 rows" leaves. */
export const itemCounts = { all: 23, few: 7 } as const;

export const paginationTable = defineTable<Item>()({
  getRowId: (item) => item.id,
  columns: (col) => [col.key("name", { label: "Name" })],
  features: [pagination({ sizes: [5, 10] })],
});

/** The pager's text, from a 0-based page index. */
export const pageText = (pageIndex: number, pageCount: number): string =>
  `Page ${String(pageIndex + 1)} of ${String(pageCount)}`;

export const paginationScenario = scenario("pagination", "Pagination", {
  rows: namesOf(itemsUpTo(itemCounts.all).slice(0, 5)),
  texts: [pageText(0, 5)],
});
