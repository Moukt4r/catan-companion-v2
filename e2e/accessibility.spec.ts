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
