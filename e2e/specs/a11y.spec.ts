import type { Locator, Page } from "@playwright/test";
import { openedText } from "../contract/index.js";
import { expect, open, requires, test } from "./fixtures.js";

test.beforeEach(async ({ page, framework }) => {
  requires(framework, "a11yHelpers");
  await open(page, "a11y");
});

test.describe("row links", () => {
  test("a click anywhere in the row opens it", async ({ page }) => {
    await page.getByRole("cell", { name: "Grace Hopper", exact: true }).click();
    await expect(page.getByTestId("opened")).toHaveText(openedText("Grace Hopper"));
  });

  test("Enter and Space open the focused row", async ({ page }) => {
    const ada = page.getByRole("row", { name: "Ada Lovelace" });
    await expect(ada).toHaveAttribute("tabindex", "0");
    await ada.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("opened")).toHaveText(openedText("Ada Lovelace"));

    await page.getByRole("row", { name: "Linus Torvalds" }).focus();
    await page.keyboard.press(" ");
    await expect(page.getByTestId("opened")).toHaveText(openedText("Linus Torvalds"));
  });

  test("a link in the row and a modified click are left alone", async ({ page }) => {
    await page.getByRole("link", { name: "View Grace Hopper" }).click();
    await expect(page).toHaveURL(/#p1$/);
    await page.getByRole("cell", { name: "Ada Lovelace", exact: true }).click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("opened")).toHaveText(openedText(undefined));
  });

  test("a click in a portal the row renders doesn't open the row", async ({ page }) => {
    await page.getByRole("button", { name: "Actions for Grace Hopper" }).click();
    const menu = page.getByRole("dialog", { name: "Menu for Grace Hopper" });
    await expect(menu).toBeVisible();
    // Plain text in the menu: not interactive, but outside the row in the DOM.
    await menu.getByText("Options for Grace Hopper").click();
    await expect(page.getByTestId("opened")).toHaveText(openedText(undefined));

    await menu.getByRole("button", { name: "Rename" }).click();
    await expect(page.getByTestId("renamed")).toHaveText("Renamed Grace Hopper");
    await expect(page.getByTestId("opened")).toHaveText(openedText(undefined));
  });
});

/** A cell of the keyboard grid by its text. */
const cell = (page: Page, text: string): Locator =>
  page.getByRole("grid", { name: "Keyboard grid" }).getByRole("gridcell", { name: text, exact: true });

test.describe("roving tab index", () => {
  test("one cell is a tab stop, and the keys move it", async ({ page, framework }) => {
    // The grid matches the server's cells by generated ids before the keys can move focus.
    requires(framework, "generatedIds");
    await expect(cell(page, "A1")).toHaveAttribute("tabindex", "0");
    await expect(cell(page, "B1")).toHaveAttribute("tabindex", "-1");

    await cell(page, "A1").focus();
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, "B1")).toBeFocused();
    await expect(cell(page, "B1")).toHaveAttribute("tabindex", "0");
    await expect(cell(page, "A1")).toHaveAttribute("tabindex", "-1");

    await page.keyboard.press("ArrowDown");
    await expect(cell(page, "B2")).toBeFocused();
    await page.keyboard.press("End");
    await expect(cell(page, "C2")).toBeFocused();
    await page.keyboard.press("Home");
    await expect(cell(page, "A2")).toBeFocused();
    await page.keyboard.press("Control+End");
    await expect(cell(page, "C3")).toBeFocused();
    // The edge stops the arrows.
    await page.keyboard.press("ArrowRight");
    await expect(cell(page, "C3")).toBeFocused();
    await page.keyboard.press("Control+Home");
    await expect(cell(page, "A1")).toBeFocused();
  });

  test("a clicked cell becomes the tab stop", async ({ page }) => {
    await cell(page, "B3").click();
    await expect(cell(page, "B3")).toHaveAttribute("tabindex", "0");
    await expect(cell(page, "A1")).toHaveAttribute("tabindex", "-1");
  });
});
