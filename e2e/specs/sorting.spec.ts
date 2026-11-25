import { people } from "../contract/index.js";
import { expect, headerOf, nameCells, open, renders, test } from "./fixtures.js";

const names = people.map((person) => person.name);
const byName = names.toSorted((a, b) => a.localeCompare(b));
const byAge = people.toSorted((a, b) => a.age - b.age).map((person) => person.name);

test.beforeEach(async ({ page }) => {
  await open(page, "sorting");
});

test("a header click cycles ascending, descending and unsorted, with aria-sort to match", async ({ page }) => {
  const name = headerOf(page, "name");
  const button = page.getByRole("button", { name: "Name", exact: true });
  await expect(name).toHaveAttribute("aria-sort", "none");

  await button.click();
  await expect(name).toHaveAttribute("aria-sort", "ascending");
  await expect(nameCells(page)).toHaveText(byName);

  await button.click();
  await expect(name).toHaveAttribute("aria-sort", "descending");
  await expect(nameCells(page)).toHaveText(byName.toReversed());

  await button.click();
  await expect(name).toHaveAttribute("aria-sort", "none");
  await expect(nameCells(page)).toHaveText(names);
});

test("a column that doesn't sort has no button and no aria-sort", async ({ page }) => {
  const role = headerOf(page, "role");
  await expect(role.getByRole("button")).toHaveCount(0);
  await expect(role).not.toHaveAttribute("aria-sort");
});

test("sorting by a new column replaces the sort, and a shift-click adds to it", async ({ page }) => {
  await page.getByRole("button", { name: "City", exact: true }).click();
  await page.getByRole("button", { name: "Age", exact: true }).click();
  await expect(headerOf(page, "city")).toHaveAttribute("aria-sort", "none");
  await expect(headerOf(page, "age")).toHaveAttribute("aria-sort", "ascending");
  await expect(nameCells(page)).toHaveText(byAge);

  // City, then age within a city.
  await page.getByRole("button", { name: "City", exact: true }).click();
  await page.getByRole("button", { name: "Age", exact: true }).click({ modifiers: ["Shift"] });
  await expect(headerOf(page, "city")).toHaveAttribute("aria-sort", "ascending");
  await expect(headerOf(page, "age")).toHaveAttribute("aria-sort", "ascending");
  const byCityThenAge = people
    .toSorted((a, b) => a.city.localeCompare(b.city) || a.age - b.age)
    .map((person) => person.name);
  await expect(nameCells(page)).toHaveText(byCityThenAge);
});

test("a sort renders the rows and the sorted header, and nothing else", async ({ page, framework }) => {
  const before = {
    page: await renders(page, "page"),
    rows: await renders(page, "rows"),
    name: await renders(page, "header-name"),
    age: await renders(page, "header-age"),
  };
  await page.getByRole("button", { name: "Name", exact: true }).click();
  await expect(nameCells(page)).toHaveText(byName);

  // The page that owns the table never reads its state, and the age header reads only its own column.
  expect(await renders(page, "page")).toBe(before.page);
  expect(await renders(page, "header-age")).toBe(before.age);
  if (framework.rerendersOnChange) {
    expect(await renders(page, "rows")).toBeGreaterThan(before.rows);
    expect(await renders(page, "header-name")).toBeGreaterThan(before.name);
  } else {
    // Solid updates the DOM in place: nothing runs again.
    expect(await renders(page, "rows")).toBe(before.rows);
    expect(await renders(page, "header-name")).toBe(before.name);
  }
});
