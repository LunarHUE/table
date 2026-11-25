import { people, selectedText } from "../contract/index.js";
import { expect, headerOf, locationProbe, nameCells, open, probe, test } from "./fixtures.js";

// The state adapter comes from core and goes to the adapter's binding (issue #40), with real history.

const names = people.map((person) => person.name);
const byName = names.toSorted((a, b) => a.localeCompare(b));
const byAgeDesc = people.toSorted((a, b) => b.age - a.age).map((person) => person.name);

const search = async (page: Parameters<typeof locationProbe>[0]): Promise<string> => (await locationProbe(page)).search;

test("sorting and paging write the URL, and back and forward replay them", async ({ page }) => {
  await open(page, "url-state");
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect(page).toHaveURL(/\?sort=name\.asc$/);
  await expect(nameCells(page)).toHaveText(byName.slice(0, 4));

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\?sort=name\.asc&page=2$/);
  await expect(nameCells(page)).toHaveText(byName.slice(4, 8));
  expect(await locationProbe(page)).toEqual({ search: "?sort=name.asc&page=2", navigations: 0, writes: 2 });

  await page.goBack();
  await expect(nameCells(page)).toHaveText(byName.slice(0, 4));
  await expect(page.getByTestId("pager")).toHaveText("Page 1 of 3");
  await page.goBack();
  await expect(nameCells(page)).toHaveText(names.slice(0, 4));
  await expect(headerOf(page, "name")).toHaveAttribute("aria-sort", "none");

  await page.goForward();
  await expect(headerOf(page, "name")).toHaveAttribute("aria-sort", "ascending");
  await page.goForward();
  await expect(nameCells(page)).toHaveText(byName.slice(4, 8));
  // History moved the table; the table wrote nothing back.
  expect((await locationProbe(page)).writes).toBe(2);
});

test("a search and a page size go in the URL, and the search goes back to the first page", async ({ page }) => {
  await open(page, "url-state");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\?page=2$/);

  await page.getByLabel("Search").fill("an");
  await expect(page).toHaveURL(/\?q=an$/);
  await expect(nameCells(page)).toHaveText(["Frances Allen", "Radia Perlman"]);

  await page.getByLabel("Search").fill("");
  await page.getByLabel("Rows per page").selectOption("8");
  await expect.poll(() => search(page)).toBe("?size=8");
  await expect(nameCells(page)).toHaveText(names.slice(0, 8));
});

test("a page opened with state in the URL starts from it", async ({ page }) => {
  await open(page, "url-state", "?sort=age.desc&page=2");
  await expect(nameCells(page)).toHaveText(byAgeDesc.slice(4, 8));
  await expect(headerOf(page, "age")).toHaveAttribute("aria-sort", "descending");
  expect((await probe(page)).state["sorting"]).toEqual([{ id: "age", desc: true }]);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\?sort=age\.desc&page=3$/);
  await expect(nameCells(page)).toHaveText(byAgeDesc.slice(8));
});

test("the table keeps its own selection while the URL owns the rest", async ({ page }) => {
  await open(page, "url-state");
  await page.getByRole("checkbox", { name: "Select Grace Hopper" }).check();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(1));
  // Selecting wrote nothing to the URL.
  expect(await locationProbe(page)).toEqual({ search: "", navigations: 0, writes: 0 });

  await page.getByRole("button", { name: "Age", exact: true }).click();
  await expect(page).toHaveURL(/\?sort=age\.asc$/);
  await page.goBack();
  await expect(nameCells(page)).toHaveText(names.slice(0, 4));
  await expect(page.getByTestId("selected")).toHaveText(selectedText(1));
  await expect(page.getByRole("checkbox", { name: "Select Grace Hopper" })).toBeChecked();
});
