import { columnLayout, defineTable } from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";

/** The width a column gets from "Widen" when nothing set one yet. */
export const defaultWidth = 120;

/** How much "Widen" adds. */
export const widenBy = 40;

/** Email starts hidden, and Name starts 160 pixels wide. */
export const columnsTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [
    col.key("name", { label: "Name" }),
    col.key("email", { label: "Email" }),
    col.key("role", { label: "Role" }),
    col.key("age", { label: "Age" }),
    col.key("city", { label: "City" }),
    col.accessor("last-seen", (person) => person.lastSeen, { label: "Last seen" }),
  ],
  features: [columnLayout()],
  initialState: {
    columnLayout: { hidden: ["email"], order: [], pinned: { start: [], end: [] }, sizes: { name: 160 } },
  },
});

/** The CSS width of a column's cells: its size variable, when the layout set one. */
export const columnWidth = (id: string): string => `var(--col-${id}-size, auto)`;

export const columnsScenario = scenario("columns", "Column layout", {
  rows: namesOf(people.slice(0, 4)),
  headers: ["Name", "Role", "Age", "City", "Last seen"],
});

/** The rows the page shows. Four are enough to see a layout. */
export const columnsRows: readonly Person[] = people.slice(0, 4);
