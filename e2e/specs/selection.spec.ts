import { people, selectedText } from "../contract/index.js";
import { expect, locationProbe, nameCells, open, probe, test } from "./fixtures.js";

const admins = people.filter((person) => person.role === "admin").map((person) => person.name);

test.beforeEach(async ({ page }) => {
  await open(page, "selection");
});

test("row checkboxes select rows, and the page checkbox shows some, all or none", async ({ page }) => {
  const selectPage = page.getByRole("checkbox", { name: "Select page" });
  await page.getByRole("checkbox", { name: "Select Ada Lovelace" }).check();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(1));
  await expect(selectPage).toHaveJSProperty("indeterminate", true);
  await expect(selectPage).toHaveAttribute("aria-checked", "mixed");

  await selectPage.click();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(5));
  await expect(selectPage).toBeChecked();
  await expect(selectPage).toHaveJSProperty("indeterminate", false);

  await selectPage.click();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(0));
  await expect(selectPage).not.toBeChecked();
});

test("select all matching covers rows on other pages, with exceptions", async ({ page }) => {
  await page.getByRole("button", { name: "Select all matching" }).click();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(12));
  expect((await probe(page)).state["selection"]).toEqual({ mode: "all", except: [] });

  await page.getByRole("checkbox", { name: "Select Grace Hopper" }).uncheck();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(11));
  expect((await probe(page)).state["selection"]).toEqual({ mode: "all", except: ["p1"] });
  await expect(page.getByRole("checkbox", { name: "Select page" })).toHaveJSProperty("indeterminate", true);

  // Rows on the next page are selected too.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("checkbox", { name: "Select Margaret Hamilton" })).toBeChecked();

  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(0));
});

// Issue #42: a filter the URL changes drops "all matching", whose meaning changed, and writes nothing back.
test("a link that changes the filter resets an all-matching selection without writing the URL", async ({ page }) => {
  await page.getByRole("button", { name: "Select all matching" }).click();
  await page.getByRole("link", { name: "Admins" }).click();
  await expect(page).toHaveURL(/\?role=admin$/);
  await expect(nameCells(page)).toHaveText(admins);
  await expect(page.getByTestId("selected")).toHaveText(selectedText(0));
  expect((await probe(page)).state["selection"]).toEqual({ mode: "ids", ids: [] });
  expect(await locationProbe(page)).toEqual({ search: "?role=admin", navigations: 1, writes: 0 });
});

test("going back resets an all-matching selection without writing the URL", async ({ page }) => {
  await page.getByRole("link", { name: "Admins" }).click();
  await expect(nameCells(page)).toHaveText(admins);
  await page.getByRole("button", { name: "Select all matching" }).click();
  await expect(page.getByTestId("selected")).toHaveText(selectedText(admins.length));
  const entries = await page.evaluate(() => history.length);

  await page.goBack();
  await expect(page).not.toHaveURL(/role=/);
  await expect(nameCells(page)).toHaveText(people.slice(0, 5).map((person) => person.name));
  await expect(page.getByTestId("selected")).toHaveText(selectedText(0));
  expect(await page.evaluate(() => history.length)).toBe(entries);
  expect(await locationProbe(page)).toEqual({ search: "", navigations: 1, writes: 0 });

  // Forward brings the filter back, and still writes nothing.
  await page.goForward();
  await expect(nameCells(page)).toHaveText(admins);
  expect((await locationProbe(page)).writes).toBe(0);
});

test("a selection of listed rows survives a filter change from the URL", async ({ page }) => {
  await page.getByRole("checkbox", { name: "Select Grace Hopper" }).check();
  await page.getByRole("link", { name: "Admins" }).click();
  await expect(nameCells(page)).toHaveText(admins);
  await expect(page.getByTestId("selected")).toHaveText(selectedText(1));
  await expect(page.getByRole("checkbox", { name: "Select Grace Hopper" })).toBeChecked();
  expect((await locationProbe(page)).writes).toBe(0);
});
