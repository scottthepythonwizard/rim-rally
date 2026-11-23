import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.VERCEL || process.env.DATABASE_URL) {
  throw new Error("Run the demo locally in a terminal without DATABASE_URL.");
}

mkdirSync(".rim-rally/demo", { recursive: true });
const origin = "http://127.0.0.1:3030";
const backend = "http://127.0.0.1:8030";
const env = {
  ...process.env,
  DJANGO_DEBUG: "1",
  DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost",
  STAFF_APP_ORIGIN: origin,
  PAYMENTS_DB_PATH: resolve(".rim-rally/demo/integration-demo.sqlite3"),
  EMAIL_BACKEND: "django.core.mail.backends.locmem.EmailBackend",
  DJANGO_API_BASE_URL: `${backend}/api`,
  NEXT_PUBLIC_BACKEND_ENABLED: "1",
  NEXT_PUBLIC_API_MODE: "server",
  NEXT_PUBLIC_API_BASE_URL: "/api",
  RIM_RALLY_LOCAL_DEMO: "1",
};

const children = [];
function start(args) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  children.push(child);
  child.on("error", (error) => { console.error(error.message); stop(1); });
  child.on("exit", (code) => stop(code ?? 1));
}

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGINT");
  process.exitCode = code;
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
start(["scripts/run-django.mjs", "--prepare-dev", "--port", "8030"]);
start(["node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3030"]);
console.log(`Rim & Rally demo: ${origin}`);
