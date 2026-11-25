import type { Locator, Page } from "@playwright/test";
import { expect, headerLabels, headerOf, open, probe, test } from "./fixtures.js";

const frame = (page: Page): Locator => page.getByTestId("columns-frame");

/** A CSS custom property as the frame's computed style has it. */
const cssVar = (page: Page, name: string): Promise<string> =>
  frame(page).evaluate((element, property) => getComputedStyle(element).getPropertyValue(property).trim(), name);

const widthOf = async (locator: Locator): Promise<number> => Math.round((await locator.boundingBox())?.width ?? 0);

test.beforeEach(async ({ page }) => {
  await open(page, "columns");
});

test("columns show and hide, and show all brings every one back", async ({ page }) => {
  await page.getByLabel("Show Email").check();
  await expect(headerLabels(page)).toHaveText(["Name", "Email", "Role", "Age", "City", "Last seen"]);
  await page.getByLabel("Show Role").uncheck();
  await page.getByLabel("Show Last seen").uncheck();
  await expect(headerLabels(page)).toHaveText(["Name", "Email", "Age", "City"]);
  await expect(page.locator('tbody td[data-col="role"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Show all columns" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "Email", "Role", "Age", "City", "Last seen"]);
});

test("pinning moves a column to the start or the end, and center puts it back", async ({ page }) => {
  await page.getByLabel("Pin City").selectOption("start");
  await expect(headerLabels(page)).toHaveText(["City", "Name", "Role", "Age", "Last seen"]);
  await expect(headerOf(page, "city")).toHaveAttribute("data-zone", "start");

  await page.getByLabel("Pin Name").selectOption("end");
  await expect(headerLabels(page)).toHaveText(["City", "Role", "Age", "Last seen", "Name"]);
  await expect(headerOf(page, "name")).toHaveAttribute("data-zone", "end");

  await page.getByLabel("Pin City").selectOption("center");
  await expect(headerLabels(page)).toHaveText(["Role", "Age", "City", "Last seen", "Name"]);
  await expect(headerOf(page, "city")).toHaveAttribute("data-zone", "center");
  expect((await probe(page)).state["columnLayout"]).toMatchObject({ pinned: { start: [], end: ["name"] } });
});

test("sizes are CSS variables the headers take their width from", async ({ page }) => {
  expect(await cssVar(page, "--col-name-size")).toBe("160px");
  expect(await widthOf(headerOf(page, "name"))).toBe(160);

  await page.getByRole("button", { name: "Widen Name" }).click();
  await expect.poll(() => cssVar(page, "--col-name-size")).toBe("200px");
  expect(await widthOf(headerOf(page, "name"))).toBe(200);

  // A column with no size gets one from the default width.
  expect(await cssVar(page, "--col-city-size")).toBe("");
  await page.getByRole("button", { name: "Widen City" }).click();
  await expect.poll(() => cssVar(page, "--col-city-size")).toBe("160px");
  expect(await widthOf(headerOf(page, "city"))).toBe(160);
});

test("moving a column puts it in the next shown slot", async ({ page }) => {
  await page.getByRole("button", { name: "Move Role right" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "Age", "Role", "City", "Last seen"]);
  await page.getByRole("button", { name: "Move City left" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "Age", "City", "Role", "Last seen"]);
});

// Issue #44: with pinned columns, a move landed one slot off.
test("a move beside pinned columns lands in the slot shown, and stays in its zone", async ({ page }) => {
  await page.getByLabel("Pin Name").selectOption("start");
  await page.getByLabel("Pin Last seen").selectOption("end");
  await expect(headerLabels(page)).toHaveText(["Name", "Role", "Age", "City", "Last seen"]);

  await page.getByRole("button", { name: "Move City left" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "Role", "City", "Age", "Last seen"]);
  await page.getByRole("button", { name: "Move City left" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "City", "Role", "Age", "Last seen"]);
  // The first center slot is as far left as an unpinned column goes.
  await page.getByRole("button", { name: "Move City left" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "City", "Role", "Age", "Last seen"]);

  // And the last center slot is as far right.
  await page.getByRole("button", { name: "Move Age right" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "City", "Role", "Age", "Last seen"]);
  await page.getByRole("button", { name: "Move Role right" }).click();
  await expect(headerLabels(page)).toHaveText(["Name", "City", "Age", "Role", "Last seen"]);
});
