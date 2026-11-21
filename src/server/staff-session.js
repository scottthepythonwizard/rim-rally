import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { djangoRequest, DjangoError, sessionCookie } from "./django-client";
import { STAFF_API_AVAILABLE } from "@/config/backend";
export const cookieName = sessionCookie;
export async function sessionToken() { return (await cookies()).get(cookieName)?.value; }
export async function currentStaff() {
  if (!STAFF_API_AVAILABLE) return null;
  if (!await sessionToken()) return null;
  try { return await djangoRequest("/staff/me"); }
  catch (error) { if (error instanceof DjangoError && [401, 403].includes(error.status)) return null; throw error; }
}
export async function requireStaff(adminOnly = false) {
  // Only the empty, read-only dashboard shell is available during this pause.
  // No identity is fabricated and all API reads/writes are blocked separately.
  if (!STAFF_API_AVAILABLE) return null;
  const actor = await currentStaff();
  if (!actor) redirect(await sessionToken() ? "/login?expired=1" : "/login");
  if (adminOnly && actor.role !== "admin") redirect("/dashboard");
  return actor;
}
