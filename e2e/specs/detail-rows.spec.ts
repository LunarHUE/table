import { countsText, detailText, people } from "../contract/index.js";
import { bodyRows, expect, nameCells, open, test } from "./fixtures.js";

// Issue #43: pagination counts and pages data rows only, and a row's details stay on its page.

const names = people.map((person) => person.name);

test.beforeEach(async ({ page }) => {
  await open(page, "detail-rows");
});

/** Each body row as `data:<id>` or `detail:<id>`. */
const rowKinds = (page: Parameters<typeof bodyRows>[0]) =>
  bodyRows(page).evaluateAll((rows) => rows.map((row) => `${row.getAttribute("data-kind") ?? ""}:${row.getAttribute("data-row-id") ?? ""}`));

test("detail rows sit under their row and don't count as rows", async ({ page }) => {
  expect(await rowKinds(page)).toEqual(["data:p1", "detail:p1~1", "detail:p1~2", "data:p2", "data:p3"]);
  await expect(page.getByText(detailText("Grace Hopper", 2), { exact: true })).toBeVisible();
  await expect(page.getByTestId("counts")).toHaveText(countsText(12, 12, 4));
  await expect(page.getByRole("button", { name: "Details for Grace Hopper" })).toHaveAttribute("aria-expanded", "true");
});

test("expanding the last row of a page keeps its details on that page", async ({ page }) => {
  await page.getByRole("button", { name: "Details for Linus Torvalds" }).click();
  expect(await rowKinds(page)).toEqual([
    "data:p1",
    "detail:p1~1",
    "detail:p1~2",
    "data:p2",
    "data:p3",
    "detail:p3~1",
    "detail:p3~2",
  ]);
  // Seven rows show, and the counts and the page count don't move.
  await expect(page.getByTestId("counts")).toHaveText(countsText(12, 12, 4));
  await expect(page.getByTestId("pager")).toHaveText("Page 1 of 4");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(nameCells(page)).toHaveText(names.slice(3, 6));
  expect(await rowKinds(page)).toEqual(["data:p4", "data:p5", "data:p6"]);
});

test("collapsing a row takes its details away", async ({ page }) => {
  await page.getByRole("button", { name: "Details for Grace Hopper" }).click();
  expect(await rowKinds(page)).toEqual(["data:p1", "data:p2", "data:p3"]);
  await expect(page.getByRole("button", { name: "Details for Grace Hopper" })).toHaveAttribute("aria-expanded", "false");
});

test("the last page holds its rows' details too", async ({ page }) => {
  for (let i = 0; i < 3; i += 1) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Details for Karen Jones" }).click();
  expect(await rowKinds(page)).toEqual(["data:p10", "data:p11", "data:p12", "detail:p12~1", "detail:p12~2"]);
  await expect(page.getByTestId("pager")).toHaveText("Page 4 of 4");
});
