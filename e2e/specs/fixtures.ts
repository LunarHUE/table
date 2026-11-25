import { test as base, expect, type Locator, type Page } from "@playwright/test";
import {
  type Capability,
  type Framework,
  frameworks,
  type LocationProbe,
  type ProbeState,
  type ScenarioId,
  scenarios,
  testIds,
} from "../contract/index.js";

/** What each project passes to its specs. */
export interface Options {
  /** The framework this project runs against. Specs read only its expectations. */
  readonly framework: Framework;
}

interface Fixtures {
  /** Marks the running spec as an expected failure when the framework lists it, for every browser or for this one. */
  readonly knownFailure: undefined;
}

// Every project sets `framework`. An option needs a default, so it is the first one.
const [firstFramework] = frameworks;
if (firstFramework === undefined) throw new Error("contract/frameworks.ts lists no framework.");

export const test = base.extend<Fixtures & Options>({
  framework: [firstFramework, { option: true }],
  knownFailure: [
    async ({ framework, browserName }, use, testInfo) => {
      const key = testInfo.titlePath.join(" > ");
      const note = framework.knownFailures?.[key] ?? framework.knownFailuresIn?.[browserName]?.[key];
      testInfo.fail(note !== undefined, note);
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };

/** Skips the running spec, with the framework's reason, when the framework lacks `capability`. */
export function requires(framework: Framework, capability: Capability): void {
  const reason = framework.lacks?.[capability];
  test.skip(reason !== undefined, `${framework.name} lacks ${capability}. ${reason}`);
}

/** The route of a scenario. */
export function routeOf(id: ScenarioId): string {
  const scenario = scenarios.find((entry) => entry.id === id);
  if (scenario === undefined) throw new Error(`No scenario "${id}".`);
  return scenario.route;
}

/**
 * Opens a scenario's page, with a query string when given, and waits until
 * it has hydrated, which is when the probe fills.
 */
export async function open(page: Page, id: ScenarioId, search = ""): Promise<void> {
  await page.goto(`${routeOf(id)}${search}`);
  await expect(page.getByTestId(testIds.probe)).not.toBeEmpty();
}

/** The table's state as the probe shows it now. */
export async function probe(page: Page): Promise<ProbeState> {
  const text = await page.getByTestId(testIds.probe).textContent();
  // The probe writes JSON of exactly this shape.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(text ?? "null") as ProbeState;
}

/** The page's location as the probe shows it now, on pages bound to the URL. */
export async function locationProbe(page: Page): Promise<LocationProbe> {
  // Pages bound to the URL put their location in the probe under this name.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return (await probe(page)).sources["location"] as LocationProbe;
}

/** The scenario's main table. */
export const mainTable = (page: Page): Locator => page.getByTestId(testIds.table);

/** The `name` cell of each data row in the main table. */
export const nameCells = (page: Page): Locator =>
  mainTable(page).locator('tbody tr[data-kind="data"] td[data-col="name"]');

/** Every body row of the main table, data and detail. */
export const bodyRows = (page: Page): Locator => mainTable(page).locator("tbody tr");

/** The header labels of the main table. */
export const headerLabels = (page: Page): Locator => mainTable(page).locator("thead th .label");

/** A header cell of the main table by its column id. */
export const headerOf = (page: Page, columnId: string): Locator =>
  mainTable(page).locator(`thead th[data-col="${columnId}"]`);

/** The count a render counter shows. */
export async function renders(page: Page, id: string): Promise<number> {
  return Number(await page.getByTestId(testIds.renders(id)).textContent());
}

/** Collects console errors, warnings and page errors from now on. */
export function consoleProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}
