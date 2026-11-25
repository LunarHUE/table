import { defineStateAdapter, defineTable, filtering, pagination, selection } from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";
import { isRole, matchesPerson, type Role } from "./filtering.js";

export interface RoleFilter {
  readonly role: Role;
}

/** The role filter lives in the URL, as `?role=admin`. The selection is the table's own. */
export const selectionTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [col.key("name", { label: "Name" }), col.key("role", { label: "Role" })],
  features: [filtering<RoleFilter, Person>({ initial: { role: "all" }, rows: matchesPerson }), pagination({ sizes: [5] }), selection()],
});

/** Reads and writes the role filter as the query string. */
export const roleAdapter = defineStateAdapter({
  features: ["filtering"] as const,
  parse(search: string) {
    const role = new URLSearchParams(search).get("role") ?? "all";
    return { filtering: { role: isRole(role) ? role : "all" } };
  },
  serialize(state): string {
    const role = state.filtering?.["role"];
    return typeof role === "string" && role !== "all" ? `?role=${role}` : "";
  },
});

/** The links over the table, each with the query string it goes to. */
export const roleLinks: readonly { readonly label: string; readonly search: string }[] = [
  { label: "Everyone", search: "" },
  { label: "Admins", search: "?role=admin" },
  { label: "Members", search: "?role=member" },
];

/** The selection line, such as "3 selected". */
export const selectedText = (count: number | undefined): string => `${count === undefined ? "Some" : String(count)} selected`;

export const selectionScenario = scenario("selection", "Selection", {
  rows: namesOf(people.slice(0, 5)),
  texts: [selectedText(0)],
});
