import { expect, test, type Page } from "@playwright/test";

async function resetBrowserState(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("catan-table-companion");
      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(
          request.error ?? new Error("Unable to delete the test database."),
        );
      };
      request.onblocked = () => {
        resolve();
      };
    });
  });
  await page.reload();
}

async function setupStandardGame(page: Page) {
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
  await expect(
    page.getByRole("heading", { name: "Roll for Ada" }),
  ).toBeVisible();
}

async function resolveRoll(page: Page) {
  await expect
    .poll(async () => {
      const dialogOpen = (await page.locator("dialog[open]").count()) > 0;
      const endTurnEnabled = await page
        .getByRole("button", { name: "End turn" })
        .isEnabled()
        .catch(() => false);
      return dialogOpen || endTurnEnabled;
    })
    .toBe(true);

  for (let step = 0; step < 5; step += 1) {
    const dialog = page.locator("dialog[open]");
    if ((await dialog.count()) === 0) {
      break;
    }
    const heading =
      (await dialog.getByRole("heading").textContent())?.trim() ?? "";
    if (/progress$/i.test(heading)) {
      await dialog
        .getByRole("button", { name: "Mark progress resolved" })
        .click();
    } else if (heading.startsWith("Resolve ")) {
      await dialog
        .getByRole("button", { name: /Mark (production|7) resolved/ })
        .click();
    } else if (
      (await dialog.getByRole("button", { name: "Event completed" }).count()) >
      0
    ) {
      await dialog.getByRole("button", { name: "Event completed" }).click();
    } else {
      throw new Error(`Unexpected resolution dialog: ${heading}`);
    }
    await expect
      .poll(async () => {
        const nextDialog = page.locator("dialog[open]");
        if ((await nextDialog.count()) === 0) {
          return "";
        }
        return (
          (await nextDialog.getByRole("heading").textContent())?.trim() ?? ""
        );
      })
      .not.toBe(heading);
  }
  await expect(page.getByRole("button", { name: "End turn" })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await resetBrowserState(page);
});

test("persists Alchemy, public state, turns, undo, and redo", async ({
  page,
}) => {
  await setupStandardGame(page);

  const cycleBefore = await page.locator(".cycle-progress").textContent();
  await page.getByRole("button", { name: "Use Alchemy" }).click();
  const alchemy = page.locator("dialog[open]");
  await alchemy.getByRole("spinbutton", { name: "Red die" }).fill("6");
  await alchemy.getByRole("spinbutton", { name: "Yellow die" }).fill("1");
  await alchemy.getByRole("button", { name: "Roll event die" }).click();
  await resolveRoll(page);
  await expect(page.locator(".cycle-progress")).toHaveText(
    cycleBefore ?? "0 / 36",
  );
  await expect(page.locator(".roll-result-summary")).toContainText(
    "Chosen with Alchemy",
  );

  await page.getByRole("button", { name: "Edit public state" }).first().click();
  const editor = page.locator("dialog[open]");
  await editor.getByRole("spinbutton", { name: "Change" }).fill("1");
  await editor
    .getByRole("textbox", { name: "Reason" })
    .fill("Public score correction");
  await editor.getByRole("button", { name: "Save public state" }).click();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("4");

  await page.getByRole("button", { name: "End turn" }).click();
  await expect(page.getByText("Grace's turn", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  let history = page.locator("dialog[open]");
  await history.getByRole("button", { name: "Undo latest" }).click();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Ada's turn", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  history = page.locator("dialog[open]");
  await history.getByRole("button", { name: "Redo" }).click();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Grace's turn", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Resume game" }).click();
  await expect(page.getByText("Grace's turn", { exact: true })).toBeVisible();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("4");
});

test("supports the explicit two-player house mode", async ({ page }) => {
  await page.getByRole("button", { name: "Start new game" }).click();
  await page
    .getByRole("checkbox", { name: /Allow two-player house mode/ })
    .check();
  await page.locator('input[placeholder="Player 1"]').fill("Nora");
  await page.locator('input[placeholder="Player 2"]').fill("Omar");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("spinbutton", { name: "Victory target" }).fill("15");
  await page.getByRole("radio", { name: /Lively/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Two-player house mode allowed")).toBeVisible();
  await page.getByRole("button", { name: "Start and save game" }).click();

  await expect(page.locator(".player-card")).toHaveCount(2);
  await expect(page.getByText("Balanced house dice")).toBeVisible();
});

test("keeps secondary tabs read-only until control is available", async ({
  context,
  page,
}) => {
  await setupStandardGame(page);
  const mirror = await context.newPage();
  await mirror.goto("/");
  await mirror
    .getByRole("button", { name: "Resume game" })
    .click({ force: true });

  await expect(mirror.getByText("Read only", { exact: true })).toBeVisible();
  await expect(
    mirror.getByRole("button", { name: "Roll", exact: true }),
  ).toBeDisabled();
  await expect(
    mirror.getByText(/Another tab controls this game/),
  ).toBeVisible();

  await page.close();
  await mirror.getByRole("button", { name: "Take control" }).click();

  await expect(mirror.getByText("Read only", { exact: true })).toHaveCount(0);
  await expect(
    mirror.getByRole("button", { name: "Roll", exact: true }),
  ).toBeEnabled();
});

test("loads the app shell offline after service-worker installation", async ({
  context,
  page,
}) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Catan Table Companion" }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
