import { itemsUpTo, namesOf, pageText } from "../contract/index.js";
import { expect, nameCells, open, probe, test } from "./fixtures.js";

const items = namesOf(itemsUpTo(23));

test.beforeEach(async ({ page }) => {
  await open(page, "pagination");
});

test("next and previous step through the pages and stop at the ends", async ({ page }) => {
  const next = page.getByRole("button", { name: "Next" });
  const prev = page.getByRole("button", { name: "Previous" });
  await expect(prev).toBeDisabled();
  await next.click();
  await expect(page.getByTestId("pager")).toHaveText(pageText(1, 5));
  await expect(nameCells(page)).toHaveText(items.slice(5, 10));

  for (let i = 0; i < 3; i += 1) await next.click();
  await expect(page.getByTestId("pager")).toHaveText(pageText(4, 5));
  await expect(nameCells(page)).toHaveText(items.slice(20));
  await expect(next).toBeDisabled();

  await prev.click();
  await expect(nameCells(page)).toHaveText(items.slice(15, 20));
});

test("a new page size goes back to the first page", async ({ page }) => {
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Rows per page").selectOption("10");
  await expect(page.getByTestId("pager")).toHaveText(pageText(0, 3));
  await expect(nameCells(page)).toHaveText(items.slice(0, 10));
  expect((await probe(page)).state["pagination"]).toMatchObject({ pageIndex: 0, pageSize: 10 });
});

// Issue #41: the page past the end used to show no rows.
test("when the data shrinks, the last page shows, and previous steps back from it", async ({ page }) => {
  const next = page.getByRole("button", { name: "Next" });
  for (let i = 0; i < 3; i += 1) await next.click();
  await expect(page.getByTestId("pager")).toHaveText(pageText(3, 5));

  await page.getByRole("button", { name: "Keep 7 rows" }).click();
  await expect(page.getByTestId("pager")).toHaveText(pageText(1, 2));
  await expect(nameCells(page)).toHaveText(items.slice(5, 7));
  await expect(next).toBeDisabled();

  await page.getByRole("button", { name: "Previous" }).click();
  await expect(page.getByTestId("pager")).toHaveText(pageText(0, 2));
  await expect(nameCells(page)).toHaveText(items.slice(0, 5));
});
