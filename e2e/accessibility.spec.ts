import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("home and setup have no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");

  const homeResults = await new AxeBuilder({ page }).analyze();
  expect(homeResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Start new game" }).click();
  const setupResults = await new AxeBuilder({ page }).analyze();
  expect(setupResults.violations).toEqual([]);
});

test("the consolidated roll result has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start new game" }).click();
  await page.locator('input[placeholder="Player 1"]').fill("Ada");
  await page.locator('input[placeholder="Player 2"]').fill("Grace");
  await page.locator('input[placeholder="Player 3"]').fill("Linus");
  await page.locator('input[placeholder="Player 4"]').fill("Margaret");
  await page
    .locator("fieldset")
    .nth(3)
    .getByRole("button", { name: "Remove" })
    .click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start and save game" }).click();
  await page.getByRole("button", { name: "Roll", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: /Roll result:/ });
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page })
    .include("dialog[open]")
    .analyze();
  expect(results.violations).toEqual([]);
});
