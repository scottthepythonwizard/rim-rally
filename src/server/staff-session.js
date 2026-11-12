import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appOrigin, sessionAccount, sessionAge } from "./staff-store.mjs";

export const cookieName = "rim_rally_staff";
export async function sessionToken() {
  return (await cookies()).get(cookieName)?.value;
}
export async function requireStaff(adminOnly = false) {
  const actor = sessionAccount(await sessionToken());
  if (!actor) redirect("/login");
  if (adminOnly && actor.role !== "admin") redirect("/dashboard");
  return actor;
}
export async function setSession(secret) {
  (await cookies()).set(cookieName, secret, {
    path: "/", httpOnly: true, sameSite: "lax", secure: appOrigin().startsWith("https:"),
    maxAge: secret ? sessionAge / 1000 : 0,
  });
}
