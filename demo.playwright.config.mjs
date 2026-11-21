import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Run after building with NEXT_PUBLIC_API_MODE=mock; never reuse a live app server.
const baseURL = "http://127.0.0.1:3030";
const database = join(mkdtempSync(join(tmpdir(), "rim-rally-demo-test-")), "staff.sqlite");
export default defineConfig({
  testDir: "./tests/e2e", outputDir: "./test-results/demo", workers: 2,
  use: { baseURL, viewport: { width: 1440, height: 1000 } },
  webServer: { command: "npm run start -- --port 3030", url: baseURL, reuseExistingServer: false,
    env: { NEXT_PUBLIC_API_MODE: "mock", STAFF_DB_PATH: database, STAFF_APP_ORIGIN: baseURL } },
});
