import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:3026";
process.env.STAFF_APP_ORIGIN = baseURL;
process.env.STAFF_TEST_DB_PATH ||= join(mkdtempSync(join(tmpdir(), "rim-rally-staff-test-")), "staff.sqlite");
process.env.STAFF_DB_PATH = process.env.STAFF_TEST_DB_PATH;

export default defineConfig({
  testDir: "./tests/staff",
  workers: 1,
  use: { baseURL },
  webServer: {
    command: "npm run start -- --port 3026",
    url: baseURL,
    reuseExistingServer: false,
    env: { STAFF_DB_PATH: process.env.STAFF_DB_PATH, STAFF_APP_ORIGIN: baseURL },
  },
});
