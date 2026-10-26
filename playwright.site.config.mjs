import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./site-tests",
  testMatch: "**/*.pw.mjs",
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 10000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  outputDir: "test-results/site",
  use: {
    baseURL: process.env.SKENDAL_SITE_URL || "http://127.0.0.1:8084",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: process.env.SKENDAL_SITE_URL
    ? undefined
    : {
        command:
          "bun run build:site && bun run export:brand && node node_modules/wrangler/bin/wrangler.js dev --config wrangler.site.jsonc --local --ip 127.0.0.1 --port 8084",
        url: "http://127.0.0.1:8084",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
