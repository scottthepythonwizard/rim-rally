import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const python = process.env.DJANGO_PYTHON || resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
if (!existsSync(python)) throw new Error("Create .venv and install requirements.txt first, or set DJANGO_PYTHON.");
const args = process.argv.slice(2), port = args.includes("--port") ? args[args.indexOf("--port") + 1] : "8000";
if (!/^\d{4,5}$/.test(port)) throw new Error("Use a valid local port.");
if (args.includes("--prepare-dev")) {
  if (process.env.VERCEL || process.env.DATABASE_URL) throw new Error("Development preparation cannot run against a hosted database.");
  if (!process.env.PAYMENTS_DB_PATH?.replaceAll("\\", "/").endsWith("/integration-demo.sqlite3")) throw new Error("Development preparation requires a separate integration-demo.sqlite3 database.");
  process.env.DJANGO_DEBUG = "1";
  for (const command of [["migrate", "--noinput"], ["prepare_integration_demo"]]) {
    const result = spawnSync(python, ["manage.py", ...command], { stdio: "inherit", env: process.env });
    if (result.status) process.exit(result.status);
  }
}
const child = spawn(python, ["manage.py", "runserver", `127.0.0.1:${port}`, "--noreload"], { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code || 0));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { child.kill(); process.exit(0); });
