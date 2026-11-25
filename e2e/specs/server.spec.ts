import { people, scenarios, testIds } from "../contract/index.js";
import { consoleProblems, expect, headerLabels, nameCells, open, test } from "./fixtures.js";

// Every scenario, rendered on the server and then hydrated.

test.describe("before any script runs", () => {
  test.use({ javaScriptEnabled: false });

  for (const scenario of scenarios) {
    test(`${scenario.id}: the server HTML has the rows`, async ({ page }) => {
      await page.goto(scenario.route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(scenario.title);
      const { rows, headers, texts = [] } = scenario.server;
      await expect(nameCells(page)).toHaveText([...rows]);
      if (headers !== undefined) await expect(headerLabels(page)).toHaveText([...headers]);
      for (const text of texts) await expect(page.getByText(text, { exact: true })).toBeVisible();
      // The probe fills only once the page is live.
      await expect(page.getByTestId(testIds.probe)).toBeEmpty();
    });
  }

  test("url-state: the server renders the state in the query string", async ({ page }) => {
    await page.goto("/url-state?sort=age.desc&page=2");
    const byAge = people.toSorted((a, b) => b.age - a.age);
    await expect(nameCells(page)).toHaveText(byAge.slice(4, 8).map((person) => person.name));
    await expect(page.getByTestId("pager")).toHaveText("Page 2 of 3");
  });
});

for (const scenario of scenarios) {
  test(`${scenario.id}: hydrates with no console error or warning`, async ({ page }) => {
    const problems = consoleProblems(page);
    await open(page, scenario.id);
    // Let any error reported after the hydrating render arrive first.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
    expect(problems).toEqual([]);
    // Hydration kept the server's rows.
    await expect(nameCells(page)).toHaveText([...scenario.server.rows]);
  });
}

test("url-state: hydrates from the query string with no console error or warning", async ({ page }) => {
  const problems = consoleProblems(page);
  await open(page, "url-state", "?sort=name.desc&size=8");
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0))));
  expect(problems).toEqual([]);
  const byName = people.map((person) => person.name).toSorted((a, b) => b.localeCompare(a));
  await expect(nameCells(page)).toHaveText(byName.slice(0, 8));
});

test("the index links every scenario", async ({ page }) => {
  await page.goto("/");
  for (const scenario of scenarios) {
    await expect(page.getByRole("link", { name: scenario.title, exact: true })).toHaveAttribute("href", scenario.route);
  }
});

test("an unknown path is a 404", async ({ request }) => {
  const response = await request.get("/nowhere");
  expect(response.status()).toBe(404);
});
