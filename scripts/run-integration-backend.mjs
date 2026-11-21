import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "rim-payment-integration-"));
const database = join(directory, "integration-demo.sqlite3");
const python = resolve(".venv/Scripts/python.exe");
const env = { ...process.env, DATABASE_URL: "", VERCEL: "", DJANGO_DEBUG: "1", STAFF_APP_ORIGIN: "http://127.0.0.1:3051", DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost,testserver", PAYMENTS_DB_PATH: database, EMAIL_BACKEND: "django.core.mail.backends.locmem.EmailBackend" };
mkdirSync("test-results", { recursive: true });
writeFileSync("test-results/integration-database.json", JSON.stringify({ database }));
for (const command of [["migrate", "--noinput"], ["prepare_integration_demo"]]) {
  const result = spawnSync(python, ["manage.py", ...command], { env, stdio: "inherit" });
  if (result.status) process.exit(result.status);
}
const server = spawn(python, ["manage.py", "runserver", "127.0.0.1:8051", "--noreload"], { env, stdio: "inherit" });
server.on("exit", (code) => process.exit(code || 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { server.kill(); process.exit(0); });
