"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  acceptInvitation, appOrigin, authenticate, createInvitation, db, digest, emailAddress,
  sessionAccount, StaffError, transaction, validRole, validToken,
} from "@/server/staff-store.mjs";
import { sessionToken, setSession } from "@/server/staff-session";
import { atHour, validDate } from "@/features/booking/scheduling";

function actorFor(secret, adminOnly = false) {
  const actor = sessionAccount(secret);
  if (!actor || (adminOnly && actor.role !== "admin")) throw new StaffError("You do not have permission for this action.");
  return actor;
}

async function resultOf(work) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof StaffError) return { error: error.message };
    throw error;
  }
}

export async function login(_previous, form) {
  const result = await resultOf(async () => {
    const secret = await authenticate(emailAddress(form.get("email")), form.get("password"));
    if (!secret) throw new StaffError("Email or password is incorrect.");
    const previous = await sessionToken();
    if (validToken(previous)) db().prepare("DELETE FROM sessions WHERE hash = ?").run(digest(previous));
    await setSession(secret);
    return {};
  });
  if (result.error) return result;
  redirect("/dashboard");
}

export async function signOut() {
  const secret = await sessionToken();
  if (validToken(secret)) db().prepare("DELETE FROM sessions WHERE hash = ?").run(digest(secret));
  await setSession("");
  redirect("/login");
}

export async function join(_previous, form) {
  const result = await resultOf(async () => {
    await acceptInvitation(form.get("invitation"), form.get("password"));
    return {};
  });
  if (result.error) return result;
  redirect("/login?created=1");
}

export async function invite(_previous, form) {
  return resultOf(async () => {
    const secret = await sessionToken();
    actorFor(secret, true);
    const role = form.get("role");
    if (!validRole(role)) throw new StaffError("Choose a valid role.");
    const origin = appOrigin();
    const email = emailAddress(form.get("email"));
    const invitation = createInvitation(email, role, false, () => actorFor(secret, true));
    revalidatePath("/dashboard/accounts");
    return { invitation: origin + "/join#" + invitation, invitationEmail: email };
  });
}

export async function manageAccount(_previous, form) {
  return resultOf(async () => {
    const secret = await sessionToken();
    transaction((database) => {
      const actor = actorFor(secret, true);
      const id = String(form.get("id") || "");
      if (actor.id === id) throw new StaffError("Another admin must make changes to your account.");
      const role = form.get("role");
      const active = form.get("active");
      if (!validRole(role) || !["0", "1"].includes(active)) throw new StaffError("Invalid account settings.");
      const current = database.prepare("SELECT role, active FROM accounts WHERE id = ?").get(id);
      if (!current) throw new StaffError("Account not found.");
      if (current.role === role && current.active === Number(active)) return;
      database.prepare("UPDATE accounts SET role = ?, active = ? WHERE id = ?").run(role, Number(active), id);
      database.prepare("DELETE FROM sessions WHERE account_id = ?").run(id);
    });
    revalidatePath("/dashboard/accounts");
    return { message: "Account updated." };
  });
}

export async function revokeInvitation(_previous, form) {
  return resultOf(async () => {
    const secret = await sessionToken();
    transaction((database) => {
      actorFor(secret, true);
      database.prepare("DELETE FROM invitations WHERE email = ? AND bootstrap = 0").run(emailAddress(form.get("email")));
    });
    revalidatePath("/dashboard/accounts");
    return { message: "Invitation revoked." };
  });
}

function scheduleInput(form) {
  const name = String(form.get("name") || "").trim();
  const sport = form.get("sport");
  const court = String(form.get("court") || "").trim();
  const date = form.get("date");
  const start = form.get("start");
  const end = form.get("end");
  const clock = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!name || name.length > 100 || !court || court.length > 80 || !["pickleball", "basketball"].includes(sport) || !validDate(date) || !clock.test(start) || !clock.test(end)) {
    throw new StaffError("Enter a valid title, sport, court, date and times.");
  }
  const starts = date + "T" + start + ":00+08:00";
  const ends = end === "00:00" ? atHour(date, 24) : date + "T" + end + ":00+08:00";
  if (starts < atHour(date, 8) || ends <= starts) throw new StaffError("Schedule a session between 8:00 AM and midnight, with an end after its start.");
  const seats = String(form.get("capacity") || "");
  const price = String(form.get("price") || "");
  const capacity = Number(seats);
  const [pesos, cents = ""] = price.split(".");
  if (!/^\d{1,4}$/.test(seats) || capacity < 1 || !/^\d{1,6}(?:\.\d{1,2})?$/.test(price)) {
    throw new StaffError("Enter a positive capacity and a valid price in pesos.");
  }
  const amount = Number(pesos) * 100 + Number(cents.padEnd(2, "0"));
  return [name, sport, court, starts, ends, capacity, amount];
}

export async function saveSchedule(_previous, form) {
  return resultOf(async () => {
    const secret = await sessionToken();
    transaction((database) => {
      actorFor(secret);
      const fields = scheduleInput(form);
      const id = form.get("id");
      if (!id) {
        database.prepare("INSERT INTO schedules (id,name,sport,court,starts,ends,capacity,amount) VALUES (?,?,?,?,?,?,?,?)").run(randomUUID(), ...fields);
      } else {
        const result = database.prepare(`
          UPDATE schedules SET name=?,sport=?,court=?,starts=?,ends=?,capacity=?,amount=?,version=version+1
          WHERE id=? AND version=? AND status='active'
        `).run(...fields, String(id), Number(form.get("version")));
        if (!result.changes) throw new StaffError("This schedule changed or was canceled. Refresh before editing.");
      }
    });
    revalidatePath("/dashboard");
    return { message: "Schedule saved." };
  });
}

export async function changeSchedule(_previous, form) {
  return resultOf(async () => {
    const secret = await sessionToken();
    const operation = form.get("operation");
    transaction((database) => {
      actorFor(secret);
      const query = operation === "cancel"
        ? "UPDATE schedules SET status='canceled', version=version+1 WHERE id=? AND version=? AND status='active'"
        : operation === "delete" ? "DELETE FROM schedules WHERE id=? AND version=?" : null;
      if (!query) throw new StaffError("Invalid schedule action.");
      const result = database.prepare(query).run(String(form.get("id") || ""), Number(form.get("version")));
      if (!result.changes) throw new StaffError("This schedule changed. Refresh and try again.");
    });
    revalidatePath("/dashboard");
    return { message: operation === "cancel" ? "Schedule canceled." : "Schedule deleted." };
  });
}
