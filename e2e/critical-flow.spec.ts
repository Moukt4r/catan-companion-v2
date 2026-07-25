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
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
}

async function resolveRoll(page: Page) {
  await expect(page.locator(".roll-result-summary")).toBeVisible();
  const worldEvent = page.getByRole("button", {
    name: "Acknowledge world event",
  });
  if (await worldEvent.isVisible()) {
    await worldEvent.click();
  }
  const nextRoll = page.getByRole("button", { name: /^Next: / });
  await expect(nextRoll).toBeEnabled();
  expect(
    await nextRoll.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      return (
        bounds.top >= 0 &&
        bounds.left >= 0 &&
        bounds.bottom <= window.innerHeight &&
        bounds.right <= window.innerWidth
      );
    }),
  ).toBe(true);
}

async function resolveSeasonRoll(page: Page) {
  await expect(page.locator(".roll-result-summary")).toBeVisible();
  const worldEvent = page.getByRole("button", {
    name: "Acknowledge world event",
  });
  const nextRoll = page.getByRole("button", { name: /^Next: / });
  await expect
    .poll(
      async () =>
        (await worldEvent.count()) > 0 ||
        ((await nextRoll.count()) > 0 && (await nextRoll.isEnabled())),
    )
    .toBe(true);
  if ((await worldEvent.count()) > 0) {
    await worldEvent.click();
  }
  await expect(nextRoll).toBeEnabled();
  await nextRoll.scrollIntoViewIfNeeded();
}

function durationSeconds(value: string | null): number {
  if (!value) return 0;
  const [hours, minutes, seconds] = value.split(":").map(Number);
  return (hours ?? 0) * 3_600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

async function storedClock(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("catan-table-companion");
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Unable to open the game database."));
      };
    });
    try {
      const transaction = database.transaction(
        ["games", "revisions"],
        "readonly",
      );
      const games = await new Promise<Array<{ headRevisionId: string }>>(
        (resolve, reject) => {
          const request = transaction.objectStore("games").getAll();
          request.onsuccess = () => {
            resolve(request.result as Array<{ headRevisionId: string }>);
          };
          request.onerror = () => {
            reject(request.error ?? new Error("Unable to read games."));
          };
        },
      );
      const game = games[0];
      if (!game) {
        throw new Error("No stored game was found.");
      }
      const revision = await new Promise<{
        state: {
          clock?: {
            totalActiveMs: number;
            runningSince: string | null;
            pausedAt: string | null;
          };
        };
      }>((resolve, reject) => {
        const request = transaction
          .objectStore("revisions")
          .get(game.headRevisionId);
        request.onsuccess = () => {
          resolve(
            request.result as {
              state: {
                clock?: {
                  totalActiveMs: number;
                  runningSince: string | null;
                  pausedAt: string | null;
                };
              };
            },
          );
        };
        request.onerror = () => {
          reject(request.error ?? new Error("Unable to read game clock."));
        };
      });
      return revision.state.clock ?? null;
    } finally {
      database.close();
    }
  });
}

test.beforeEach(async ({ page }) => {
  await resetBrowserState(page);
});

test("persists opt-in sound effects and volume without network assets", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Settings" }).click();
  const settings = page.locator("dialog[open]");
  await settings.getByRole("checkbox", { name: /sound effects/i }).check();
  await settings.getByRole("slider", { name: "Sound volume" }).fill("0.7");
  await settings.getByRole("button", { name: "Preview sound" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = localStorage.getItem(
          "catan-companion-device-preferences",
        );
        return stored
          ? (JSON.parse(stored) as {
              soundEnabled: boolean;
              soundVolume: number;
            })
          : null;
      }),
    )
    .toEqual(expect.objectContaining({ soundEnabled: true, soundVolume: 0.7 }));
  await expect(page.getByText(/sound unavailable/i)).toHaveCount(0);

  await settings.getByRole("button", { name: "Close" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Settings" }).click();
  const reloaded = page.locator("dialog[open]");
  await expect(
    reloaded.getByRole("checkbox", { name: /sound effects/i }),
  ).toBeChecked();
  await expect(
    reloaded.getByRole("slider", { name: "Sound volume" }),
  ).toHaveValue("0.7");

  await reloaded.getByRole("button", { name: "Close" }).click();
  await setupStandardGame(page);
  const soundToggle = page.getByRole("button", { name: "Sound on" });
  await expect(soundToggle).toHaveAttribute("aria-pressed", "true");
  await soundToggle.click();
  await expect(page.getByRole("button", { name: "Sound off" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("requests persistent storage when a game starts without wake lock", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "storage", {
      configurable: true,
      value: {
        persist: () => {
          localStorage.setItem("persist-requested", "yes");
          return Promise.resolve(true);
        },
        persisted: () => Promise.resolve(false),
        estimate: () => Promise.resolve({ quota: 1_000_000, usage: 1_000 }),
      },
    });
  });

  await setupStandardGame(page);

  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("persist-requested")))
    .toBe("yes");
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
  await expect(page.locator("main.game-layout .cycle-progress")).toHaveText(
    cycleBefore ?? "0 / 36",
  );
  await expect(page.locator(".roll-result-summary")).toContainText(
    "Chosen with Alchemy",
  );

  await page.getByRole("button", { name: "Increase Ada points" }).click();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("4");

  await page.getByRole("button", { name: "History" }).click();
  let history = page.locator("dialog[open]");
  await history.getByRole("button", { name: "Undo latest" }).click();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("3");

  await page.getByRole("button", { name: "History" }).click();
  history = page.locator("dialog[open]");
  await history.getByRole("button", { name: "Redo" }).click();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("4");

  await page.getByRole("button", { name: "Next: Grace" }).click();
  await resolveRoll(page);
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
  await page
    .getByRole("slider", { name: "World event frequency percent" })
    .fill("13");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Two-player house mode allowed")).toBeVisible();
  await page.getByRole("button", { name: "Start and save game" }).click();

  await expect(page.locator(".player-card")).toHaveCount(2);
  await expect(page.getByText("Balanced house dice")).toBeVisible();
});

test("next-player roll advances the turn and updates the inline result", async ({
  page,
}) => {
  await setupStandardGame(page);
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await resolveRoll(page);
  await page.getByRole("button", { name: "Next: Grace" }).click();
  await resolveRoll(page);

  await expect(
    page.getByRole("dialog", { name: /Roll result:/ }),
  ).not.toBeVisible();
  await expect(page.getByText("Grace's turn", { exact: true })).toBeVisible();
  await expect(page.locator(".game-meta")).toContainText("Turn 2");
});

test("opens Alchemy directly for the next player", async ({ page }) => {
  await setupStandardGame(page);
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await resolveRoll(page);

  await page.getByRole("button", { name: "Alchemy: Grace" }).click();
  const alchemy = page.locator("dialog[open]");
  await expect(alchemy).toBeVisible();
  await expect(page.getByText("Grace's turn", { exact: true })).toBeVisible();
  await alchemy.getByRole("spinbutton", { name: "Red die" }).fill("5");
  await alchemy.getByRole("spinbutton", { name: "Yellow die" }).fill("4");
  await alchemy.getByRole("button", { name: "Roll event die" }).click();
  await resolveRoll(page);

  await expect(page.locator(".roll-result-summary")).toContainText(
    "Chosen with Alchemy",
  );
  await expect(
    page.getByRole("button", { name: "Alchemy: Linus" }),
  ).toBeVisible();
});

test("tracks per-player time and freezes every timer while paused", async ({
  page,
}) => {
  await setupStandardGame(page);
  await page.waitForTimeout(1_100);
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await resolveRoll(page);
  await page.getByRole("button", { name: "Next: Grace" }).click();
  await resolveRoll(page);
  const playerTime = (index: number) =>
    page
      .locator(".player-card")
      .nth(index)
      .locator(".player-time strong")
      .textContent()
      .then(durationSeconds);
  await expect.poll(() => playerTime(0)).toBeGreaterThan(0);
  await expect.poll(() => playerTime(1)).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = page.getByRole("dialog", { name: "Game paused" });
  await expect(paused).toBeVisible();
  const pausedTimes = await paused
    .locator(".pause-clock-grid dd")
    .allTextContents();
  await page.waitForTimeout(1_200);
  expect(
    await paused.locator(".pause-clock-grid dd").allTextContents(),
  ).toEqual(pausedTimes);
  await expect(paused.getByRole("button")).toHaveCount(1);
  const underlyingButtons = page.locator("main.game-layout button");
  for (let index = 0; index < (await underlyingButtons.count()); index += 1) {
    await expect(underlyingButtons.nth(index)).toBeDisabled();
  }
  await expect(page.locator(".pwa-toast")).toHaveCount(0);
  await paused.getByRole("button", { name: "Resume game" }).click();
  await expect(page.locator(".roll-result-summary")).toBeVisible();
  const turnClock = () =>
    page
      .locator(".game-clock-row strong")
      .nth(0)
      .textContent()
      .then(durationSeconds);
  const beforeResumeTick = await turnClock();
  await expect.poll(turnClock).toBeGreaterThan(beforeResumeTick);
});

test("does not count time while a game is archived", async ({ page }) => {
  await setupStandardGame(page);
  await page.waitForTimeout(1_100);
  await page.reload();
  await page.getByRole("button", { name: "Start another game" }).click();
  await page.getByRole("button", { name: "Archive and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Set up the table" }),
  ).toBeVisible();

  const archived = await storedClock(page);
  expect(archived).toMatchObject({
    runningSince: null,
  });
  await page.waitForTimeout(1_200);
  await page.reload();

  await page.getByRole("button", { name: /Saved games/ }).click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Roll for Ada" }),
  ).toBeVisible();

  const resumed = await storedClock(page);
  expect(resumed?.totalActiveMs).toBe(archived?.totalActiveMs);
  expect(resumed).toMatchObject({
    pausedAt: null,
  });
  expect(resumed?.runningSince).not.toBeNull();
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
  browserName,
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

  if (browserName === "webkit") {
    await context.route("**/*", async (route) => {
      await route.abort();
    });
    try {
      const html = await page.evaluate(async () => {
        const response = await fetch(window.location.href);
        return response.text();
      });
      expect(html).toContain("<title>Catan Table Companion</title>");
    } finally {
      await context.unroute("**/*");
    }
    return;
  }

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

test("configures Seasons Mode and announces a round-boundary transition", async ({
  page,
}) => {
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

  await page.getByRole("checkbox", { name: /Enable Seasons Mode/ }).check();
  await page
    .getByRole("combobox", { name: "Rounds per season" })
    .selectOption("2");
  await page
    .getByRole("combobox", { name: "Starting season" })
    .selectOption("winter");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/Winter start · 2 rounds\/season/)).toBeVisible();
  await page.getByRole("button", { name: "Start and save game" }).click();

  await expect(
    page.getByLabel("Current season: Winter, round 1 of 2"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await resolveSeasonRoll(page);

  for (let completedTurn = 0; completedTurn < 6; completedTurn += 1) {
    await page.getByRole("button", { name: /^Next: / }).click();
    await expect(page.locator(".game-meta")).toContainText(
      `Turn ${completedTurn + 2}`,
    );
    await resolveSeasonRoll(page);
  }

  await expect(
    page.getByLabel("Current season: Spring, round 1 of 2"),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "The season has changed to Spring",
  );
  await expect(page.locator(".season-transition__art")).toBeVisible();

  await page.getByRole("button", { name: "History" }).click();
  const history = page.locator("dialog[open]");
  await expect(history).toContainText("Spring began.");
  await history.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /^Next: / }).click();
  await expect(page.locator(".game-meta")).toContainText("Turn 8");
  await resolveSeasonRoll(page);
  await expect(page.locator(".season-transition")).toHaveCount(0);
});
