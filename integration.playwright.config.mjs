import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/integration", outputDir: "./test-results/integration", workers: 1, timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3051", trace: "retain-on-failure", actionTimeout: 15000 },
  webServer: [
    { command: "node scripts/run-integration-backend.mjs", url: "http://127.0.0.1:8051/api/auth/csrf", reuseExistingServer: false, timeout: 60000 },
    { command: "npm run start -- --port 3051", url: "http://127.0.0.1:3051", reuseExistingServer: false,
      env: { NEXT_PUBLIC_BACKEND_ENABLED: "1", NEXT_PUBLIC_API_MODE: "server", DJANGO_API_BASE_URL: "http://127.0.0.1:8051/api", STAFF_APP_ORIGIN: "http://127.0.0.1:3051" } },
  ],
});
