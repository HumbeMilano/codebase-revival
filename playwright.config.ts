import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "bun run build && bun run preview -- --host 127.0.0.1 --port 8080 --strictPort",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54329",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_homehub_e2e",
    },
  },
});
