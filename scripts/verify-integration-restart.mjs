import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const { database } = JSON.parse(readFileSync("test-results/integration-database.json", "utf8"));
const session = JSON.parse(readFileSync("test-results/integration-session.json", "utf8"));
if (!resolve(database).startsWith(resolve(tmpdir()) + sep) || basename(database) !== "integration-demo.sqlite3" || !basename(dirname(database)).startsWith("rim-payment-integration-")) throw new Error("Restart checks require the disposable integration-test database.");
const env = { ...process.env, DATABASE_URL: "", VERCEL: "", DJANGO_DEBUG: "1", PAYMENTS_DB_PATH: database,
  DJANGO_ALLOWED_HOSTS: "127.0.0.1,localhost,testserver", EMAIL_BACKEND: "django.core.mail.backends.locmem.EmailBackend",
  NEXT_PUBLIC_BACKEND_ENABLED: "1", NEXT_PUBLIC_API_MODE: "server", STAFF_APP_ORIGIN: "http://127.0.0.1:3051", DJANGO_API_BASE_URL: "http://127.0.0.1:8052/api" };
const backend = spawn(resolve(".venv/Scripts/python.exe"), ["manage.py", "runserver", "127.0.0.1:8052", "--noreload"], { env, windowsHide: true, stdio: "ignore" });
const frontend = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3051"], { env, windowsHide: true, stdio: "ignore" });
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* startup */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("The restarted test server did not become ready.");
}
try {
  await Promise.all([ready("http://127.0.0.1:8052/api/auth/csrf"), ready("http://127.0.0.1:3051/")]);
  const passResponse = await fetch(`http://127.0.0.1:3051/api/bookings/${session.bookingId}`, { headers: { "X-Guest-Recovery": session.credential } });
  const pass = await passResponse.json();
  if (!passResponse.ok || pass.status !== "confirmed" || pass.id !== session.bookingId) throw new Error("The saved pass did not survive the restart.");
  const cookies = new Map();
  const remember = (response) => { for (const value of response.headers.getSetCookie()) { const pair = value.split(";")[0], split = pair.indexOf("="); cookies.set(pair.slice(0, split), pair.slice(split + 1)); } };
  remember(await fetch("http://127.0.0.1:8052/api/auth/csrf"));
  const headers = () => ({ Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "), "Content-Type": "application/json", "X-CSRFToken": cookies.get("rim_rally_csrf"), Origin: "http://127.0.0.1:3051" });
  const login = await fetch("http://127.0.0.1:8052/api/auth/login", { method: "POST", headers: headers(), body: JSON.stringify({ email: "integration-admin@example.test", password: "Integration-test-only!9331" }) });
  if (!login.ok) throw new Error("Test staff login after restart failed.");
  remember(login);
  const ticket = await fetch(`http://127.0.0.1:8052/api/staff/tickets/${encodeURIComponent(session.ticketToken)}`, { headers: headers() });
  if (!ticket.ok) throw new Error("Saved pass verification failed after restart.");
  const details = await (await fetch(`http://127.0.0.1:8052/api/staff/bookings/${session.bookingId}`, { headers: headers() })).json();
  const proof = await fetch(`http://127.0.0.1:8052/api/staff/proofs/${details.proofs[0].id}`, { headers: headers() });
  if (!proof.ok || proof.headers.get("Content-Type") !== "image/png" || !(await proof.arrayBuffer()).byteLength) throw new Error("Private proof was not readable after restart.");
  console.log("Restart verified: frontend and Django read the same confirmed pass and private proof; backend signature verification passed.");
} finally { frontend.kill(); backend.kill(); }
