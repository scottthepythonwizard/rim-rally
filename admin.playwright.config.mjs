import { defineConfig } from "@playwright/test";
const baseURL = "http://127.0.0.1:3029";
export default defineConfig({
  testDir: "./tests/admin", outputDir: "./test-results/admin", workers: 1, timeout: 60000,
  use: { baseURL, actionTimeout: 15000, viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure" },
  // The removed API must not be started or replaced for these tests.
  webServer: { command: "npm run start -- --port 3029", url: baseURL, reuseExistingServer: false,
    env: { STAFF_APP_ORIGIN: baseURL, DJANGO_API_BASE_URL: "http://127.0.0.1:1/api" } },
});
