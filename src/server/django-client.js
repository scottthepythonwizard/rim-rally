import "server-only";
import { cookies } from "next/headers";
import { STAFF_API_AVAILABLE, UNAVAILABLE_MESSAGE } from "@/config/backend";

export const sessionCookie = "rim_rally_staff";
export const csrfCookie = "rim_rally_csrf";
export class DjangoError extends Error {
  constructor(message, status = 503, code = "BACKEND_UNAVAILABLE") { super(message); this.status = status; this.code = code; }
}
export function frontendOrigin() { return new URL(process.env.STAFF_APP_ORIGIN || "http://127.0.0.1:3000").origin; }
export function backendBase() {
  const base = process.env.DJANGO_API_BASE_URL || (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000/api" : "");
  if (!base) throw new DjangoError("The Django backend is not configured. Set DJANGO_API_BASE_URL on the frontend server.");
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new DjangoError("Use an HTTPS Django API URL, or a loopback HTTP URL for local development.");
  return base.replace(/\/$/, "");
}
export async function syncCookies(response, jar) {
  for (const header of response.headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(";");
    const split = pair.indexOf("="), name = pair.slice(0, split).trim(), value = pair.slice(split + 1);
    if (![sessionCookie, csrfCookie].includes(name)) continue;
    const maxAge = attributes.find((v) => v.trim().toLowerCase().startsWith("max-age="));
    jar.set(name, value, { path: "/", httpOnly: true, secure: frontendOrigin().startsWith("https:"), sameSite: "lax", maxAge: maxAge ? Number(maxAge.split("=")[1]) : 28800 });
  }
}
export async function djangoRequest(path, { method = "GET", body, raw = false, mutation = false, headers = {} } = {}) {
  if (!STAFF_API_AVAILABLE) throw new DjangoError(UNAVAILABLE_MESSAGE, 503, "TEMPORARILY_UNAVAILABLE");
  const base = backendBase(), jar = await cookies();
  const cookieHeader = () => [sessionCookie, csrfCookie].map((name) => jar.get(name)).filter(Boolean).map(({ name, value }) => `${name}=${value}`).join("; ");
  try {
    if (mutation && !jar.get(csrfCookie)?.value) {
      const initial = await fetch(`${base}/auth/csrf`, { cache: "no-store", headers: { Cookie: cookieHeader(), Accept: "application/json" }, signal: AbortSignal.timeout(15000), redirect: "manual" });
      if (!initial.ok) throw new DjangoError("The Django security token could not be loaded. Try again.");
      await syncCookies(initial, jar);
    }
    const form = body instanceof FormData;
    const response = await fetch(`${base}${path}`, { method, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json", Cookie: cookieHeader(), ...(body && !form ? { "Content-Type": "application/json" } : {}),
        ...(mutation ? { Origin: frontendOrigin(), "X-CSRFToken": jar.get(csrfCookie)?.value || "" } : {}), ...headers },
      ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }) });
    if (mutation) await syncCookies(response, jar);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new DjangoError(data?.error?.message || "The Django request could not be completed. Refresh and try again.", response.status, data?.error?.code);
    }
    return raw ? response : await response.json();
  } catch (error) {
    if (error instanceof DjangoError) throw error;
    throw new DjangoError("The Django backend could not be reached. Check that it is running and try again.");
  }
}
export function queryString(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (typeof value === "string" || typeof value === "number") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
