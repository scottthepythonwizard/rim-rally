import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(() => { throw new Error("Paused code must not read cookies"); }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useSearchParams: () => new URLSearchParams("date=2030-01-01"), useRouter: () => ({ replace: vi.fn() }) }));

import { djangoRequest } from "@/server/django-client";
import { currentStaff } from "@/server/staff-session";
import * as data from "@/server/staff-data";
import * as actions from "@/features/staff/actions";
import * as bookingActions from "@/features/staff/booking-actions";
import { ActionForm } from "@/features/staff/forms";
import BookingFlow from "@/features/booking/booking-flow";
import Confirmation from "@/features/checkout/confirmation";

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_API_MODE", "server"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test("direct Django requests and session lookup stop before cookies or fetch", async () => {
  await expect(djangoRequest("/auth/login", { method: "POST", body: {}, mutation: true })).rejects.toMatchObject({ message: "Temporarily unavailable", status: 503 });
  expect(await currentStaff()).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("paused presentation data never reads saved records", async () => {
  for (const name of ["listBookings", "listCustomers", "listCancellations", "listSessions", "listSchedules", "listAccounts", "listInvitations", "listCourts"]) expect(await data[name]()).toEqual([]);
  for (const name of ["bookingDetails", "readCustomer", "readSchedule"]) expect(await data[name]("existing-record")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test("forged or stale staff submissions do not call any removed endpoints", async () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ email: "test@example.test", password: "Test-only password", id: "old-record", bookingId: "old-booking", proofId: "old-proof", paymentId: "old-payment", type: "court", start: "8", end: "9", date: "2030-01-01", sport: "pickleball", court: "pickleball-1" })) form.set(key, value);
  for (const name of ["login", "join", "invite", "manageAccount", "revokeInvitation", "saveSchedule", "changeSchedule"]) expect(await actions[name]({}, form)).toMatchObject({ error: "Temporarily unavailable" });
  expect(await actions.signOut()).toMatchObject({ error: "Temporarily unavailable" });
  for (const action of Object.values(bookingActions)) expect(await action({}, form)).toMatchObject({ error: "Temporarily unavailable" });
  expect(fetch).not.toHaveBeenCalled();
});

test("disabled forms preserve their controls and block programmatic submission", () => {
  const submit = vi.fn(), confirm = vi.spyOn(window, "confirm");
  render(<ActionForm action={submit} confirm="Confirm change?"><label>Customer<input name="name" /></label><button>Save booking</button></ActionForm>);
  expect(screen.getByText("Temporarily unavailable")).toBeVisible();
  expect(screen.getByLabelText("Customer")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save booking" })).toBeDisabled();
  fireEvent.submit(screen.getByRole("button").closest("form"));
  expect(confirm).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

test("live booking recovery never mounts the network controller", () => {
  render(<BookingFlow facility={{ id: "rim-and-rally", sports: ["pickleball", "basketball"] }} serverNow="2026-11-20T08:00:00+08:00" />);
  expect(screen.getByText("Temporarily unavailable")).toBeVisible();
  expect(screen.getByRole("button", { name: "Continue to booking" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});

test("old confirmation links cannot recover or print a stored pass", () => {
  render(<Confirmation bookingId="old-booking" />);
  expect(screen.getByText("Temporarily unavailable")).toBeVisible();
  expect(screen.getByRole("button", { name: "Print / Save as PDF" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});
