import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const email = process.argv[2];
if (!email) throw new Error("Use npm run staff:bootstrap -- admin@example.com with the backend environment loaded.");
const python = process.env.DJANGO_PYTHON || resolve(process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
const result = spawnSync(python, ["manage.py", "bootstrap_staff", email], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
