import { defineTable, filtering } from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";

export type Role = "all" | Person["role"];

export interface PeopleFilters {
  readonly q: string;
  readonly role: Role;
}

export const roles: readonly Role[] = ["all", "admin", "member"];

export const isRole = (value: string): value is Role => (roles as readonly string[]).includes(value);

/** Whether a person matches a search and a role. */
export const matchesPerson = (person: Person, filters: { readonly q?: string; readonly role?: Role }): boolean =>
  (filters.role === undefined || filters.role === "all" || person.role === filters.role) &&
  person.name.toLowerCase().includes((filters.q ?? "").trim().toLowerCase());

/**
 * Starts on members only. Clearing shows everyone; resetting goes back to
 * members. "Filtered" means the filters differ from where the table started,
 * so the page starts unfiltered and a cleared table counts as filtered.
 */
export const filteringTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [col.key("name", { label: "Name" }), col.key("role", { label: "Role" }), col.key("city", { label: "City" })],
  features: [
    filtering<PeopleFilters, Person>({
      initial: { q: "", role: "member" },
      empty: { q: "", role: "all" },
      rows: matchesPerson,
    }),
  ],
});

/** The line under the table, such as "7 of 12 people". */
export const matchText = (shown: number): string => `${String(shown)} of ${String(people.length)} people`;

export const filteredText = (filtered: boolean): string => (filtered ? "Filtered" : "Not filtered");

const members = people.filter((person) => person.role === "member");

export const filteringScenario = scenario("filtering", "Filtering", {
  rows: namesOf(members),
  texts: [matchText(members.length), filteredText(false)],
});
