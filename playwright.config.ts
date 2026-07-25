import { defineConfig, devices } from "@playwright/test";

const previewPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${previewPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${previewPort}`,
    url: `http://127.0.0.1:${previewPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
      },
    },
    {
      name: "mobile-webkit",
      use: {
        ...devices["iPhone 15"],
      },
    },
  ],
});
