"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { djangoRequest, DjangoError, sessionCookie, csrfCookie } from "@/server/django-client";
async function perform(path, body) {
  try {
    const result = await djangoRequest(path, { method: "POST", body, mutation: true });
    revalidatePath("/dashboard", "layout"); return result;
  } catch (error) {
    if (error instanceof DjangoError) return { error: error.message, loginRequired: error.status === 401 || error.status === 403 };
    throw error;
  }
}
const fields = (form) => Object.fromEntries(form.entries());
export async function login(_previous, form) {
  const result = await perform("/auth/login", fields(form));
  if (result.error) return result;
  redirect("/dashboard");
}
export async function signOut() {
  const result = await perform("/auth/logout", {});
  if (result.error) return result;
  const jar = await cookies(); jar.delete(sessionCookie); jar.delete(csrfCookie);
  redirect("/login");
}
export async function join(_previous, form) {
  const result = await perform("/auth/join", fields(form));
  if (result.error) return result;
  redirect("/login?created=1");
}
export async function invite(_previous, form) { return perform("/staff/invitations", fields(form)); }
export async function manageAccount(_previous, form) { return perform("/staff/accounts/update", fields(form)); }
export async function revokeInvitation(_previous, form) { return perform("/staff/invitations/revoke", fields(form)); }
export async function saveSchedule(_previous, form) { return perform("/staff/schedules", fields(form)); }
export async function changeSchedule(_previous, form) { return perform("/staff/schedules/change", fields(form)); }
