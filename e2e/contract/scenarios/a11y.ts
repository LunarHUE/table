import { defineTable } from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";

/** Rows that open on click or Enter, each with a link and a menu button of its own. */
export const a11yTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [col.key("name", { label: "Name" }), col.key("role", { label: "Role" })],
});

export const a11yRows: readonly Person[] = people.slice(0, 4);

/** The status line: what the last row click or key opened. */
export const openedText = (name: string | undefined): string => (name === undefined ? "Nothing opened" : `Opened ${name}`);

/** The cells of the keyboard grid, by row. */
export const gridCells: readonly (readonly string[])[] = [
  ["A1", "B1", "C1"],
  ["A2", "B2", "C2"],
  ["A3", "B3", "C3"],
];

export const a11yScenario = scenario("a11y", "Accessibility helpers", {
  rows: namesOf(a11yRows),
  texts: [openedText(undefined)],
});
