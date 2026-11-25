import { filteredText, matchText, people } from "../contract/index.js";
import { expect, nameCells, open, probe, test } from "./fixtures.js";

const members = people.filter((person) => person.role === "member").map((person) => person.name);

test.beforeEach(async ({ page }) => {
  await open(page, "filtering");
});

test("starts on members, and the role filter shows the others", async ({ page }) => {
  await expect(nameCells(page)).toHaveText(members);
  // The filters are where the table started.
  await expect(page.getByTestId("filtered")).toHaveText(filteredText(false));

  await page.getByLabel("Role").selectOption("admin");
  const admins = people.filter((person) => person.role === "admin").map((person) => person.name);
  await expect(nameCells(page)).toHaveText(admins);
  await expect(page.getByTestId("matches")).toHaveText(matchText(admins.length));
  await expect(page.getByTestId("filtered")).toHaveText(filteredText(true));
});

test("the search narrows the rows within the role", async ({ page }) => {
  await page.getByLabel("Search").fill("an");
  await expect(nameCells(page)).toHaveText(["Frances Allen", "Radia Perlman"]);
  await expect(page.getByTestId("matches")).toHaveText(matchText(2));
  await expect(page.getByTestId("filtered")).toHaveText(filteredText(true));
  expect((await probe(page)).state["filtering"]).toEqual({ q: "an", role: "member" });
});

test("clear empties every filter, and reset goes back to where the table started", async ({ page }) => {
  await page.getByLabel("Search").fill("an");
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(nameCells(page)).toHaveText(people.map((person) => person.name));
  await expect(page.getByLabel("Search")).toHaveValue("");
  await expect(page.getByLabel("Role")).toHaveValue("all");
  // Everyone shows, which differs from the members the table started with.
  await expect(page.getByTestId("filtered")).toHaveText(filteredText(true));

  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(nameCells(page)).toHaveText(members);
  await expect(page.getByLabel("Role")).toHaveValue("member");
  await expect(page.getByTestId("filtered")).toHaveText(filteredText(false));
});

test("a filter that matches nothing leaves an empty body", async ({ page }) => {
  await page.getByLabel("Search").fill("zzz");
  await expect(nameCells(page)).toHaveCount(0);
  await expect(page.getByTestId("matches")).toHaveText(matchText(0));
});
