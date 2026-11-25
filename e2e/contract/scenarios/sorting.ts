import { defineTable, sorting, type SortDir } from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";

/** Name, age and city sort; role doesn't. A click sorts by one column, a shift-click adds it to the sort. */
export const sortingTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [
    col.key("name", { label: "Name", sortable: true }),
    col.key("role", { label: "Role" }),
    col.key("age", { label: "Age", sortable: true }),
    col.key("city", { label: "City", sortable: true }),
  ],
  features: [sorting()],
});

export const sortingScenario = scenario("sorting", "Sorting", {
  rows: namesOf(people),
  headers: ["Name", "Role", "Age", "City"],
});

/** A column's sort direction from what `useColumnState(table, id, "sorting")` reads. */
export const sortDirOf = (value: unknown): SortDir => (value === "asc" || value === "desc" ? value : false);

/** The `aria-sort` of a sortable header. */
export const ariaSortOf = (dir: SortDir): "ascending" | "descending" | "none" =>
  dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none";
