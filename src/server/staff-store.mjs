import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const hour = 3_600_000;
export const sessionAge = 8 * hour;
export class StaffError extends Error {}
export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export const validToken = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
export const validRole = (role) => ["staff", "admin"].includes(role);

export function emailAddress(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new StaffError("Enter a valid email address.");
  return email;
}

export function appOrigin() {
  const url = new URL(process.env.STAFF_APP_ORIGIN || "http://127.0.0.1:3000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (local && url.protocol === "http:")) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("STAFF_APP_ORIGIN must be an HTTPS origin or a loopback HTTP origin.");
  }
  return url.origin;
}

let connection;
export function db() {
  if (connection) return connection;
  const path = resolve(/*turbopackIgnore: true*/ process.env.STAFF_DB_PATH || ".rim-rally/staff.sqlite");
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(path, { timeout: 5000 });
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('staff','admin')), active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS invitations (
      hash TEXT PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('staff','admin')),
      expires INTEGER NOT NULL, bootstrap INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sport TEXT NOT NULL, court TEXT NOT NULL,
      starts TEXT NOT NULL, ends TEXT NOT NULL, capacity INTEGER NOT NULL, amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', version INTEGER NOT NULL DEFAULT 1
    );
  `);
  connection = database;
  return database;
}

export function transaction(work) {
  const database = db();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work(database);
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createInvitation(email, role, bootstrap = false, authorize = () => {}) {
  const secret = token();
  transaction((database) => {
    authorize();
    if (bootstrap && database.prepare("SELECT 1 FROM accounts LIMIT 1").get()) throw new StaffError("Initial setup is complete. An admin can invite more accounts.");
    if (database.prepare("SELECT 1 FROM accounts WHERE email = ?").get(email)) throw new StaffError("An account already exists for this email.");
    if (bootstrap) database.prepare("DELETE FROM invitations WHERE bootstrap = 1").run();
    database.prepare("DELETE FROM invitations WHERE email = ? OR expires <= ?").run(email, Date.now());
    database.prepare("INSERT INTO invitations VALUES (?, ?, ?, ?, ?)").run(digest(secret), email, role, Date.now() + 24 * hour, Number(bootstrap));
  });
  return secret;
}

export function findInvitation(secret) {
  if (!validToken(secret)) return null;
  return db().prepare("SELECT email, role, bootstrap FROM invitations WHERE hash = ? AND expires > ?").get(digest(secret), Date.now());
}

async function passwordKey(password, salt) {
  return derive(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
}

export async function acceptInvitation(secret, password) {
  if (!findInvitation(secret)) throw new StaffError("This invitation is invalid or expired.");
  if (typeof password !== "string" || password.length < 12 || password.length > 128) throw new StaffError("Use a password between 12 and 128 characters.");
  const salt = randomBytes(16);
  const key = await passwordKey(password, salt);
  transaction((database) => {
    const invite = findInvitation(secret);
    if (!invite || (invite.bootstrap && database.prepare("SELECT 1 FROM accounts LIMIT 1").get())) throw new StaffError("This invitation is invalid or expired.");
    if (database.prepare("SELECT 1 FROM accounts WHERE email = ?").get(invite.email)) throw new StaffError("An account already exists for this email.");
    database.prepare("INSERT INTO accounts (id,email,password,role) VALUES (?,?,?,?)").run(randomUUID(), invite.email, salt.toString("hex") + ":" + key.toString("hex"), invite.role);
    database.prepare("DELETE FROM invitations WHERE hash = ?").run(digest(secret));
  });
}

export async function authenticate(email, password) {
  if (typeof password !== "string" || !password || password.length > 128) return null;
  const now = Date.now();
  transaction((database) => {
    database.prepare("DELETE FROM login_limits WHERE expires <= ?").run(now);
    for (const [key, limit] of [["email:" + digest(email), 10], ["global", 120]]) {
      const rate = database.prepare("SELECT count FROM login_limits WHERE key = ?").get(key);
      if (rate?.count >= limit) throw new StaffError("Too many attempts. Try again in 15 minutes.");
      database.prepare("INSERT INTO login_limits VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1").run(key, now + 900_000);
    }
  });
  const account = db().prepare("SELECT id, password FROM accounts WHERE email = ? AND active = 1").get(email);
  const [salt, expected] = (account?.password || ("00".repeat(16) + ":" + "00".repeat(64))).split(":");
  const actual = await passwordKey(password, Buffer.from(salt, "hex"));
  if (!timingSafeEqual(actual, Buffer.from(expected, "hex")) || !account) return null;
  return transaction((database) => {
    if (!database.prepare("SELECT 1 FROM accounts WHERE id = ? AND active = 1 AND password = ?").get(account.id, account.password)) return null;
    const secret = token();
    database.prepare("DELETE FROM sessions WHERE expires <= ?").run(now);
    database.prepare("DELETE FROM login_limits WHERE key = ?").run("email:" + digest(email));
    database.prepare("INSERT INTO sessions VALUES (?,?,?)").run(digest(secret), account.id, now + sessionAge);
    return secret;
  });
}

export function sessionAccount(secret) {
  if (!validToken(secret)) return null;
  return db().prepare(`
    SELECT a.id, a.email, a.role FROM sessions s JOIN accounts a ON a.id = s.account_id
    WHERE s.hash = ? AND s.expires > ? AND a.active = 1
  `).get(digest(secret), Date.now()) || null;
}
