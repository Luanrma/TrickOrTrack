import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
const databasePath = `.data/e2e-${randomUUID()}`;
export default defineConfig({
  testDir: "./e2e",
  timeout: 45000,
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node --import tsx server/index.ts",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 90000,
    env: {
      APP_URL: "http://localhost:3100",
      PORT: "3100",
      HOST: "127.0.0.1",
      APP_DEMO_MODE: "true",
      PGLITE_PATH: databasePath,
      NEXT_DIST_DIR: ".next-e2e",
      DATABASE_URL: "",
      ADMIN_EMAIL: "qa@trickortrack.local",
      ADMIN_PASSWORD: "qa-local-test-password-2026",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
