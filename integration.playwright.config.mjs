import { defineConfig } from "@playwright/test";
const demoOrigin = process.env.RIM_RALLY_DEMO_ORIGIN;
const noDemo = process.env.RIM_RALLY_VERIFY_NO_DEMO === "1";
const noDemoOrigin = "http://127.0.0.1:3031";
const browserExecutable = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE;
export default defineConfig({
  testDir: "./tests/integration", outputDir: "./test-results/integration", workers: 1, timeout: 60000,
  testIgnore: noDemo ? undefined : "**/no-demo.spec.js",
  use: { baseURL: noDemo ? noDemoOrigin : demoOrigin || "http://127.0.0.1:3051", trace: "retain-on-failure", actionTimeout: 15000,
    launchOptions: browserExecutable ? { executablePath: browserExecutable } : undefined },
  webServer: noDemo ? { command: "npm run dev -- --webpack --port 3031", url: noDemoOrigin, timeout: 90000,
    env: { NEXT_PUBLIC_API_MODE: "server", NEXT_PUBLIC_BACKEND_ENABLED: "", NEXT_PUBLIC_API_BASE_URL: "/api", DJANGO_API_BASE_URL: "http://127.0.0.1:1/api", RIM_RALLY_LOCAL_DEMO: "0" } }
    : demoOrigin ? { command: "npm run demo", url: demoOrigin, reuseExistingServer: true, timeout: 90000 } : [
    { command: "node scripts/run-integration-backend.mjs", url: "http://127.0.0.1:8051/api/auth/csrf", reuseExistingServer: false, timeout: 60000 },
    { command: "npm run start -- --port 3051", url: "http://127.0.0.1:3051", reuseExistingServer: false,
      env: { NEXT_PUBLIC_BACKEND_ENABLED: "1", NEXT_PUBLIC_API_MODE: "server", DJANGO_API_BASE_URL: "http://127.0.0.1:8051/api", STAFF_APP_ORIGIN: "http://127.0.0.1:3051" } },
  ],
});
