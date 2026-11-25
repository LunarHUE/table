// The contract every app renders and every spec reads. Nothing here knows a
// framework: apps import it to render the same tables, specs import it to
// find them.
export { type Item, itemsUpTo, namesOf, type Person, people } from "./data.js";
export { type Browser, type Capability, type Framework, frameworkNamed, frameworks } from "./frameworks.js";
export { createLocation, type LocationProbe, type PageLocation } from "./location.js";
export {
  appElementId,
  clientEntry,
  indexTitle,
  type RenderedPage,
  type RenderPage,
  statusFor,
  testIds,
} from "./page.js";
export { type ProbeSource, type ProbeState, type ProbeTable, readProbe, startProbe } from "./probe.js";
export { countRender } from "./renders.js";
export { type ScenarioInfo, type ServerView } from "./scenario.js";
export { type Pages, type ScenarioId, scenarioAt, scenarios } from "./scenarios.js";
export { a11yRows, a11yScenario, a11yTable, gridCells, openedText } from "./scenarios/a11y.js";
export { columnsRows, columnsScenario, columnsTable, columnWidth, defaultWidth, widenBy } from "./scenarios/columns.js";
export {
  countsText,
  detailId,
  detailRowsScenario,
  detailRowsTable,
  detailText,
  type Expanded,
  expanding,
  type ExpandingApi,
} from "./scenarios/detail-rows.js";
export {
  filteredText,
  filteringScenario,
  filteringTable,
  isRole,
  matchesPerson,
  matchText,
  type PeopleFilters,
  type Role,
  roles,
} from "./scenarios/filtering.js";
export { itemCounts, pageText, paginationScenario, paginationTable } from "./scenarios/pagination.js";
export { type RoleFilter, roleAdapter, roleLinks, selectedText, selectionScenario, selectionTable } from "./scenarios/selection.js";
export { ariaSortOf, sortDirOf, sortingScenario, sortingTable } from "./scenarios/sorting.js";
export { type SearchFilter, urlAdapter, urlStateScenario, urlStateTable } from "./scenarios/url-state.js";
