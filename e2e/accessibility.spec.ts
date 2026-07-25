import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function setupFourPlayerGame(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Start new game" }).click();
  await page.locator('input[placeholder="Player 1"]').fill("Ada");
  await page.locator('input[placeholder="Player 2"]').fill("Grace");
  await page.locator('input[placeholder="Player 3"]').fill("Linus");
  await page.locator('input[placeholder="Player 4"]').fill("Margaret");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start and save game" }).click();
  await expect(
    page.getByRole("heading", { name: "Roll for Ada" }),
  ).toBeVisible();
}

test("home and setup have no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveAttribute("content", /default-src 'self'/);

  const homeResults = await new AxeBuilder({ page }).analyze();
  expect(homeResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Start new game" }).click();
  const setupResults = await new AxeBuilder({ page }).analyze();
  expect(setupResults.violations).toEqual([]);
});

test("the board designer has no detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Board designer/ }).click();
  const libraryResults = await new AxeBuilder({ page }).analyze();
  expect(libraryResults.violations).toEqual([]);

  await page.getByRole("button", { name: "Start default board" }).click();
  await page.getByRole("button", { name: "Generate board" }).click();
  await expect(
    page.getByRole("group", {
      name: "Untitled island board layout with 37 placed hexes",
    }),
  ).toBeVisible();
  const normalResults = await new AxeBuilder({ page })
    .include("main.board-designer-layout")
    .analyze();
  expect(normalResults.violations).toEqual([]);
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "high-contrast";
  });
  const tokenColors = await page
    .locator(".board-number-token")
    .first()
    .evaluate((token) => ({
      disc: getComputedStyle(token.querySelector(".board-number-token__disc")!)
        .fill,
      pips: getComputedStyle(token.querySelector(".board-number-token__pips")!)
        .fill,
      value: getComputedStyle(
        token.querySelector(".board-number-token__value")!,
      ).fill,
    }));
  expect(tokenColors.disc).toMatch(/rgb\(255, 255, 255\)|#fff/i);
  expect(tokenColors.value).toMatch(/rgb\(0, 0, 0\)|#000/i);
  expect(tokenColors.pips).toMatch(/rgb\(0, 0, 0\)|#000/i);
  await expect(page.locator("main.board-designer-layout")).toBeVisible();
  const highContrastResults = await new AxeBuilder({ page })
    .include("main.board-designer-layout")
    .analyze();
  expect(highContrastResults.violations).toEqual([]);
});

test("the inline roll result has no detectable accessibility violations", async ({
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

  await expect(page.locator(".roll-result-summary")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Next: .* & roll$/ }),
  ).toBeEnabled();
  await expect(page.getByRole("dialog", { name: /Roll result:/ })).toHaveCount(
    0,
  );
  const results = await new AxeBuilder({ page })
    .include("main.game-layout")
    .analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = page.getByRole("dialog", { name: "Game paused" });
  await expect(paused).toBeVisible();
  const pausedResults = await new AxeBuilder({ page })
    .include("dialog[open]")
    .analyze();
  expect(pausedResults.violations).toEqual([]);
  await expect(paused.getByRole("button")).toHaveCount(1);
});

test("the active four-player table remains accessible across visual themes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await setupFourPlayerGame(page);

  for (const theme of ["light", "dark", "high-contrast"] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, `${theme} theme violations`).toEqual([]);
  }

  const undersizedButtons = await page
    .locator("button:visible")
    .evaluateAll((buttons) =>
      buttons.flatMap((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.width < 44 || bounds.height < 44
          ? [
              {
                label:
                  button.getAttribute("aria-label") ??
                  button.textContent?.trim() ??
                  "button",
                width: bounds.width,
                height: bounds.height,
              },
            ]
          : [];
      }),
    );
  expect(undersizedButtons).toEqual([]);
});
