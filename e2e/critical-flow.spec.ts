import { expect, test, type Page } from "@playwright/test";

async function resetBrowserState(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );
    for (const name of [
      "catan-table-companion",
      "catan-table-companion-board-designs",
    ]) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
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
    }
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

async function openHeaderMenu(page: Page) {
  const panel = page.locator(".header-menu__panel");
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(panel).toBeVisible();
  }
}

async function resolveRoll(page: Page) {
  await expect(page.locator(".roll-result-summary")).toBeVisible();
  await acknowledgeSevenIfPresent(page);
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

/**
 * A rolled 7 holds the resolution open so the table can discard and move the
 * robber. Nothing else advances until someone dismisses it.
 */
async function acknowledgeSevenIfPresent(page: Page) {
  const seven = page.getByRole("button", { name: "Acknowledge the 7" });
  const nextRoll = page.getByRole("button", { name: /^Next: / });
  const worldEvent = page.getByRole("button", {
    name: "Acknowledge world event",
  });
  // The roll animation runs for ~650ms, so the summary can be on screen before
  // the 7 panel renders. Wait until the roll settles into one of its outcomes
  // rather than sampling once and skipping a 7 that has not appeared yet.
  await expect
    .poll(
      async () =>
        (await seven.count()) > 0 ||
        (await worldEvent.count()) > 0 ||
        ((await nextRoll.count()) > 0 && (await nextRoll.isEnabled())),
    )
    .toBe(true);
  if ((await seven.count()) > 0) {
    await seven.scrollIntoViewIfNeeded();
    await seven.click();
    await expect(seven).toHaveCount(0);
  }
}

async function resolveSeasonRoll(page: Page) {
  await expect(page.locator(".roll-result-summary")).toBeVisible();
  await acknowledgeSevenIfPresent(page);
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

async function readFootprint(
  page: Page,
): Promise<Array<{ q: number; r: number }>> {
  return page.locator(".board-hex--footprint").evaluateAll((elements) =>
    elements.map((element) => ({
      q: Number(element.getAttribute("data-q")),
      r: Number(element.getAttribute("data-r")),
    })),
  );
}

function footprintSpans(
  footprint: ReadonlyArray<{ q: number; r: number }>,
): [number, number, number] {
  return [
    coordinateSpan(footprint.map(({ q }) => q)),
    coordinateSpan(footprint.map(({ r }) => r)),
    coordinateSpan(footprint.map(({ q, r }) => q + r)),
  ];
}

function coordinateSpan(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values) + 1;
}

function isRotationallySymmetric(
  footprint: ReadonlyArray<{ q: number; r: number }>,
): boolean {
  const keys = new Set(footprint.map(({ q, r }) => `${q},${r}`));
  const first = footprint[0];
  return (
    first !== undefined &&
    footprint.some((candidate) => {
      const offset = {
        q: first.q + candidate.q,
        r: first.r + candidate.r,
      };
      return footprint.every(({ q, r }) =>
        keys.has(`${offset.q - q},${offset.r - r}`),
      );
    })
  );
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

test("creates, edits, and restores a custom board design", async ({ page }) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await expect(
    page.getByRole("heading", { name: "Board Designer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start blank inventory" }).click();

  await page
    .getByRole("button", { name: "Increase Forest" })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole("spinbutton", { name: "Forest" })).toHaveValue(
    "2",
  );
  await page.getByRole("button", { name: "Increase Forest" }).click();
  await page.getByRole("button", { name: "Increase Gold Field" }).click();
  await page.getByRole("button", { name: "Increase Sea" }).click();
  await expect(page.getByRole("spinbutton", { name: "Forest" })).toHaveValue(
    "3",
  );
  await expect(
    page.getByRole("spinbutton", { name: "Gold Field" }),
  ).toHaveValue("1");
  await expect(page.getByRole("spinbutton", { name: "Sea" })).toHaveValue("1");
  await page.getByText("Number tokens", { exact: true }).click();
  await page.getByRole("button", { name: "Increase Number 6" }).click();
  await page.getByText("Ports", { exact: true }).click();
  await page.getByRole("button", { name: "Increase Forest 2:1" }).click();
  await page.getByRole("spinbutton", { name: "Width" }).fill("5");
  await page.getByRole("spinbutton", { name: "Height" }).fill("1");
  await expect(page.getByRole("spinbutton", { name: "Width" })).toHaveValue(
    "5",
  );
  await expect(page.getByRole("spinbutton", { name: "Height" })).toHaveValue(
    "1",
  );
  await expect(
    page.getByText("Width × height must have the same odd or even parity"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Apply width × height" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Apply width × height" }).click();
  await expect(page.getByText("5 cells / 5 terrain tiles")).toBeVisible();
  await page.getByRole("button", { name: "Add mirrored pair" }).click();
  const addPair = page
    .getByRole("button", { name: /Add mirrored border pair at q/ })
    .first();
  const addPairLabel = await addPair.getAttribute("aria-label");
  const addedCoordinate = addPairLabel?.match(/q (-?\d+), r (-?\d+)/);
  if (!addedCoordinate) {
    throw new Error("The mirrored border coordinate was not available.");
  }
  await addPair.click();
  await expect(page.getByText("7 cells / 5 terrain tiles")).toBeVisible();
  await page.getByRole("button", { name: "Remove mirrored pair" }).click();
  await page
    .getByRole("button", {
      name: `Empty border cell q ${addedCoordinate[1]}, r ${addedCoordinate[2]}`,
    })
    .click();
  await expect(page.getByText("5 cells / 5 terrain tiles")).toBeVisible();

  await page.getByRole("button", { name: "Forest, 3 left" }).click();
  await page
    .getByRole("button", { name: "Empty border cell q 0, r 0" })
    .click();
  await page.getByRole("button", { name: "Sea, 1 left" }).click();
  await page
    .getByRole("button", { name: "Empty border cell q 1, r 0" })
    .click();
  await page.getByRole("button", { name: "Gold Field, 1 left" }).click();
  await page
    .getByRole("button", { name: /Empty border cell/ })
    .first()
    .click();
  await page.getByRole("button", { name: "6, 1 left" }).click();
  // Land tiles render face down by default, the way they sit on the table.
  // Reveal them so the terrain-labelled hexes can be targeted.
  await page.getByRole("button", { name: "Reveal terrain" }).click();
  await page
    .getByRole("button", {
      name: /Gold Field hex at q .* no number token/,
    })
    .click();
  await page.getByRole("button", { name: "Forest 2:1, 1 left" }).click();
  await page
    .getByRole("button", {
      name: /Empty port edge between land q 0, r 0 and sea q 1, r 0, east edge/,
    })
    .click();

  await expect(
    page.getByRole("button", {
      name: /Forest 2:1 between land q 0, r 0 and sea q 1, r 0, east edge/,
    }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Design name" }).fill("E2E coast");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await expect(page.getByText("Saved locally")).toBeVisible();
  await page.getByRole("button", { name: "Saved designs" }).click();
  await expect(page.getByRole("heading", { name: "E2E coast" })).toBeVisible();
  await expect(page.getByText("3 placed hexes")).toBeVisible();
  await page.getByRole("button", { name: "Open" }).click();
  await expect(
    page.getByRole("group", {
      name: "E2E coast board layout with 3 placed hexes",
    }),
  ).toBeVisible();
  // Reopening starts face down again, so reveal before checking terrain.
  await page.getByRole("button", { name: "Reveal terrain" }).click();
  await expect(
    page.getByRole("button", {
      name: /Gold Field hex at q .* number 6/,
    }),
  ).toBeVisible();
});

test("auto-generates a complete classic board", async ({ page }) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await page.getByRole("button", { name: "Start default board" }).click();
  await page.getByRole("button", { name: "Generate board" }).click();

  await expect(
    page.getByRole("group", {
      name: "Untitled island board layout with 42 placed hexes",
    }),
  ).toBeVisible();
  const topology = await page
    .locator(".board-hex[data-terrain]")
    .evaluateAll((elements) => {
      const directions = [
        [1, 0],
        [1, -1],
        [0, -1],
        [-1, 0],
        [-1, 1],
        [0, 1],
      ] as const;
      const cells = elements.map((element) => ({
        q: Number(element.getAttribute("data-q")),
        r: Number(element.getAttribute("data-r")),
        terrain: element.getAttribute("data-terrain"),
      }));
      const land = new Set(
        cells
          .filter(({ terrain }) => terrain !== "sea")
          .map(({ q, r }) => `${q},${r}`),
      );
      const sea = new Set(
        cells
          .filter(({ terrain }) => terrain === "sea")
          .map(({ q, r }) => `${q},${r}`),
      );
      const visited = new Set<string>();
      let landComponents = 0;
      for (const key of land) {
        if (visited.has(key)) {
          continue;
        }
        landComponents += 1;
        const queue = [key];
        visited.add(key);
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) {
            continue;
          }
          const [q, r] = current.split(",").map(Number);
          for (const [dq, dr] of directions) {
            const neighbor = `${(q ?? 0) + dq},${(r ?? 0) + dr}`;
            if (land.has(neighbor) && !visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }
      const adjacentSea = cells.some(
        ({ q, r, terrain }) =>
          terrain === "sea" &&
          directions.some(([dq, dr]) => sea.has(`${q + dq},${r + dr}`)),
      );
      const componentSizes: number[] = [];
      visited.clear();
      for (const key of land) {
        if (visited.has(key)) {
          continue;
        }
        let size = 0;
        const queue = [key];
        visited.add(key);
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) {
            continue;
          }
          size += 1;
          const [q, r] = current.split(",").map(Number);
          for (const [dq, dr] of directions) {
            const neighbor = `${(q ?? 0) + dq},${(r ?? 0) + dr}`;
            if (land.has(neighbor) && !visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
        componentSizes.push(size);
      }
      return {
        adjacentSea,
        landComponents,
        minimumIslandSize: Math.min(...componentSizes),
        // Rotate about the board's own centre rather than the origin: a
        // stretched outline is still 180-degree symmetric, just not around
        // (0, 0).
        symmetric: (() => {
          const offsetQ = Math.round(
            (2 * cells.reduce((total, { q }) => total + q, 0)) / cells.length,
          );
          const offsetR = Math.round(
            (2 * cells.reduce((total, { r }) => total + r, 0)) / cells.length,
          );
          return cells.every(({ q, r }) =>
            cells.some(
              (candidate) =>
                candidate.q === offsetQ - q && candidate.r === offsetR - r,
            ),
          );
        })(),
      };
    });
  expect(topology.minimumIslandSize).toBeGreaterThanOrEqual(3);
  expect(topology.symmetric).toBe(true);
  expect(topology.adjacentSea).toBe(true);

  for (const format of ["JSON", "SVG", "PNG"] as const) {
    const dismissUpdate = page.getByRole("button", { name: "Dismiss" });
    if (await dismissUpdate.isVisible()) {
      await dismissUpdate.click();
    }
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: format, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(
      new RegExp(
        `^catan-board-\\d{4}-\\d{2}-\\d{2}-untitled-island\\.${format.toLowerCase()}$`,
      ),
    );
  }
});

test("uses the table's own board-designer defaults", async ({ page }) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await page.getByRole("button", { name: "Start default board" }).click();

  for (const [label, value] of [
    ["Forest", "5"],
    ["Pasture", "5"],
    ["Fields", "5"],
    ["Hills", "5"],
    ["Mountains", "5"],
    ["Gold Field", "2"],
    ["Desert", "0"],
    ["Sea", "15"],
  ] as const) {
    await expect(page.getByRole("spinbutton", { name: label })).toHaveValue(
      value,
    );
  }
  await page.getByText("Number tokens", { exact: true }).click();
  // Counted from the physical set rather than derived from an even spread:
  // most values mirror their partner around seven, but 6 and 8 do not.
  const expectedNumbers: Record<string, string> = {
    "Number 2": "2",
    "Number 3": "3",
    "Number 4": "3",
    "Number 5": "3",
    "Number 6": "2",
    "Number 8": "3",
    "Number 9": "3",
    "Number 10": "3",
    "Number 11": "3",
    "Number 12": "2",
  };
  for (const [label, value] of Object.entries(expectedNumbers)) {
    await expect(page.getByRole("spinbutton", { name: label })).toHaveValue(
      value,
    );
  }
});

test("resizes the border with width and height inputs", async ({ page }) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await page.getByRole("button", { name: "Start default board" }).click();
  await expect(page.locator(".board-hex--footprint")).toHaveCount(42);
  const before = await readFootprint(page);

  await page.getByRole("spinbutton", { name: "Width" }).fill("10");
  await page.getByRole("spinbutton", { name: "Height" }).fill("5");
  await page.getByRole("button", { name: "Apply width × height" }).click();
  await expect(page.locator("main.board-designer-layout")).toHaveAttribute(
    "data-design-revision",
    "1",
  );
  const after = await readFootprint(page);
  expect(after).toHaveLength(before.length);
  expect(footprintSpans(after).slice(0, 2)).toEqual([10, 5]);
  expect(isRotationallySymmetric(after)).toBe(true);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("main.board-designer-layout")).toHaveAttribute(
    "data-design-revision",
    "2",
  );
  await expect.poll(() => readFootprint(page)).toEqual(before);
});

test("rejects stale board-designer writes across tabs", async ({
  context,
  page,
}) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await page.getByRole("button", { name: "Start blank inventory" }).click();

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await secondPage.getByRole("button", { name: /Board designer/ }).click();
  await secondPage.getByRole("button", { name: "Open" }).click();
  const secondEditor = secondPage.locator("main.board-designer-layout");
  await expect(secondEditor).toBeVisible();
  await expect(secondEditor).toHaveAttribute("data-design-revision", "0");

  await page.getByRole("button", { name: "Increase Forest" }).click();
  await expect(page.locator("main.board-designer-layout")).toHaveAttribute(
    "data-design-revision",
    "1",
  );
  await expect(secondEditor).toHaveAttribute("data-design-revision", "0");
  await secondPage
    .getByRole("button", { name: "Increase Sea" })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

  await expect(secondPage.getByRole("alert")).toContainText(
    "changed in another tab",
  );
  await expect(
    secondPage.getByRole("spinbutton", { name: "Forest" }),
  ).toHaveValue("1");
  await expect(secondPage.getByRole("spinbutton", { name: "Sea" })).toHaveValue(
    "0",
  );
  await secondPage.close();
});

test("returns a stale editor to the library after remote deletion", async ({
  context,
  page,
}) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await page.getByRole("button", { name: "Start blank inventory" }).click();

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await secondPage.getByRole("button", { name: /Board designer/ }).click();
  await secondPage.getByRole("button", { name: "Open" }).click();
  await expect(secondPage.locator("main.board-designer-layout")).toBeVisible();

  await page.getByRole("button", { name: "Saved designs" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete this board design?" })
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(page.getByText("No saved designs yet.")).toBeVisible();

  await secondPage.getByRole("button", { name: "Increase Forest" }).click();
  await expect(
    secondPage.getByRole("heading", { name: "Board Designer" }),
  ).toBeVisible();
  await expect(secondPage.getByRole("alert")).toContainText(
    "deleted in another tab",
  );
  await secondPage.close();
});

test("removes a stale library card after a conflicted delete", async ({
  context,
  page,
}) => {
  await page.getByRole("button", { name: /Board designer/ }).click();
  await page.getByRole("button", { name: "Start blank inventory" }).click();
  await page.getByRole("button", { name: "Saved designs" }).click();

  const secondPage = await context.newPage();
  await secondPage.goto("/");
  await secondPage.getByRole("button", { name: /Board designer/ }).click();
  await expect(
    secondPage.getByRole("heading", { name: "Untitled island" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete" }).click();
  await page
    .getByRole("dialog", { name: "Delete this board design?" })
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(page.getByText("No saved designs yet.")).toBeVisible();

  await secondPage.getByRole("button", { name: "Delete" }).click();
  await secondPage
    .getByRole("dialog", { name: "Delete this board design?" })
    .getByRole("button", { name: "Delete permanently" })
    .click();
  await expect(secondPage.getByRole("alert")).toContainText(
    "deleted in another tab",
  );
  await expect(secondPage.getByText("No saved designs yet.")).toBeVisible();
  await expect(
    secondPage.getByRole("dialog", { name: "Delete this board design?" }),
  ).toHaveCount(0);
  await secondPage.close();
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
  await openHeaderMenu(page);
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

  await openHeaderMenu(page);
  await page.getByRole("button", { name: "History" }).click();
  let history = page.locator("dialog[open]");
  await history.getByRole("button", { name: "Undo latest" }).click();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("3");

  await openHeaderMenu(page);
  await page.getByRole("button", { name: "History" }).click();
  history = page.locator("dialog[open]");
  await history.getByRole("button", { name: "Redo" }).click();
  await history.getByRole("button", { name: "Close" }).click();
  await expect(
    page.locator(".player-card").first().locator(".player-score strong"),
  ).toHaveText("4");

  await page.getByRole("button", { name: "Next: Grace" }).click();
  await resolveRoll(page);
  await expect(
    page.getByRole("heading", { name: "Roll for Grace" }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Resume game" }).click();
  await expect(
    page.getByRole("heading", { name: "Roll for Grace" }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("heading", { name: "Roll for Grace" }),
  ).toBeVisible();
  await expect(page.locator(".game-meta")).toContainText("Turn 2");
});

test("opens Alchemy directly for the next player", async ({ page }) => {
  await setupStandardGame(page);
  await page.getByRole("button", { name: "Roll", exact: true }).click();
  await resolveRoll(page);

  await page.getByRole("button", { name: "Alchemy: Grace" }).click();
  const alchemy = page.locator("dialog[open]");
  await expect(alchemy).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Roll for Grace" }),
  ).toBeVisible();
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

  await openHeaderMenu(page);
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
      .locator(".player-card--current .player-time strong")
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

  await openHeaderMenu(page);
  await page.getByRole("button", { name: "History" }).click();
  const history = page.locator("dialog[open]");
  await expect(history).toContainText("Spring began.");
  await history.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /^Next: / }).click();
  await expect(page.locator(".game-meta")).toContainText("Turn 8");
  await resolveSeasonRoll(page);
  await expect(page.locator(".season-transition")).toHaveCount(0);
});
