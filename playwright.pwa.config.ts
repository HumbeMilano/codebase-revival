import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./pwa-e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: "list",
  outputDir: "test-results/pwa-split",
  use: {
    baseURL: "http://app.localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
        ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
        : {}),
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command:
      "bun run build && bunx wrangler dev --local --config wrangler.pwa-test.jsonc --ip 127.0.0.1 --port 8081 --inspector-port 0",
    url: "http://127.0.0.1:8081",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54329",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_homehub_e2e",
    },
  },
});
