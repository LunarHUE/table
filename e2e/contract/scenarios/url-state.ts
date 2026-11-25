import {
  defineStateAdapter,
  defineTable,
  filtering,
  pagination,
  selection,
  sorting,
  type SortingState,
} from "@lunarhue/table-core";
import { namesOf, type Person, people } from "../data.js";
import { scenario } from "../scenario.js";
import { matchesPerson } from "./filtering.js";

export interface SearchFilter {
  readonly q: string;
}

/** Sorting, paging and the search live in the URL. The selection is the table's own. */
export const urlStateTable = defineTable<Person>()({
  getRowId: (person) => person.id,
  columns: (col) => [
    col.key("name", { label: "Name", sortable: true }),
    col.key("age", { label: "Age", sortable: true }),
    col.key("city", { label: "City" }),
  ],
  features: [
    sorting(),
    filtering<SearchFilter, Person>({ initial: { q: "" }, rows: matchesPerson }),
    pagination({ sizes: [4, 8] }),
    selection(),
  ],
});

const sizes = [4, 8];

const parseSort = (value: string | null): SortingState =>
  (value ?? "")
    .split(",")
    .filter((part) => part !== "")
    .map((part) => {
      const [id = "", dir] = part.split(".");
      return { id, desc: dir === "desc" };
    });

const positive = (value: string | null): number | undefined => {
  const n = Number(value);
  return value !== null && Number.isInteger(n) && n >= 1 ? n : undefined;
};

/**
 * The query string as `?sort=name.asc,age.desc&page=2&size=8&q=ada`. The
 * page is from 1, and a value equal to its default is left out.
 */
export const urlAdapter = defineStateAdapter({
  features: ["sorting", "pagination", "filtering"] as const,
  parse(search: string) {
    const params = new URLSearchParams(search);
    const page = positive(params.get("page")) ?? 1;
    const size = positive(params.get("size"));
    return {
      sorting: parseSort(params.get("sort")),
      pagination: { pageIndex: page - 1, ...(size !== undefined && sizes.includes(size) ? { pageSize: size } : {}) },
      filtering: { q: params.get("q") ?? "" },
    };
  },
  serialize(state, defaults): string {
    const params = new URLSearchParams();
    const sort = state.sorting ?? [];
    if (sort.length > 0) params.set("sort", sort.map((entry) => `${entry.id}.${entry.desc ? "desc" : "asc"}`).join(","));
    const page = state.pagination;
    if (page && page.pageIndex > 0) params.set("page", String(page.pageIndex + 1));
    if (page && page.pageSize !== defaults.pagination?.pageSize) params.set("size", String(page.pageSize));
    const q = state.filtering?.["q"];
    if (typeof q === "string" && q !== "") params.set("q", q);
    const text = params.toString();
    return text === "" ? "" : `?${text}`;
  },
});

export const urlStateScenario = scenario("url-state", "URL state", {
  rows: namesOf(people.slice(0, 4)),
  headers: ["Name", "Age", "City"],
});
