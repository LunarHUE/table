import { a11yScenario } from "./scenarios/a11y.js";
import { columnsScenario } from "./scenarios/columns.js";
import { detailRowsScenario } from "./scenarios/detail-rows.js";
import { filteringScenario } from "./scenarios/filtering.js";
import { paginationScenario } from "./scenarios/pagination.js";
import { selectionScenario } from "./scenarios/selection.js";
import { sortingScenario } from "./scenarios/sorting.js";
import { urlStateScenario } from "./scenarios/url-state.js";

/** Every scenario, in the order the index lists them. */
export const scenarios = [
  sortingScenario,
  filteringScenario,
  paginationScenario,
  detailRowsScenario,
  selectionScenario,
  columnsScenario,
  urlStateScenario,
  a11yScenario,
] as const;

export type ScenarioId = (typeof scenarios)[number]["id"];

/** One page component per scenario. An app that leaves one out, or adds one, fails to compile. */
export type Pages<C> = { readonly [K in ScenarioId]: C };

/** The scenario whose route is `path`. */
export const scenarioAt = (path: string): (typeof scenarios)[number] | undefined =>
  scenarios.find((entry) => entry.route === path);
