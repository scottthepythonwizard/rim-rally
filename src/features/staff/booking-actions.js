"use server";
import { revalidatePath } from "next/cache";
import { djangoRequest, DjangoError } from "@/server/django-client";
async function perform(path, body, headers) {
  try {
    const result = await djangoRequest(`/staff/${path}`, { method: "POST", body, headers, mutation: true });
    revalidatePath("/dashboard", "layout"); return result;
  } catch (error) {
    if (error instanceof DjangoError) return { error: error.message, loginRequired: [401, 403].includes(error.status) };
    return { error: "The change could not be saved. Please try again." };
  }
}
export async function walkIn(_previous, form) {
  const date = String(form.get("date") || ""), sport = form.get("sport"), mode = form.get("type");
  const first = Number(form.get("start")), last = Number(form.get("end"));
  if (mode === "court" && (!Number.isInteger(first) || !Number.isInteger(last) || first < 8 || last > 24 || first >= last)) return { error: "Choose consecutive hours between 8 AM and midnight." };
  return perform("walk-ins", { facilityId: "rim-and-rally", sport, date, mode,
    ...(mode === "court" ? { slotIds: Array.from({ length: last - first }, (_, i) => `${date}_${form.get("court")}_${first + i}`) } : { sessionId: form.get("sessionId") }),
    method: form.get("method"), guest: { name: form.get("name"), email: form.get("email"), mobile: form.get("mobile") } }, { "Idempotency-Key": String(form.get("key") || "") });
}
export async function uploadProof(_previous, form) { return perform(`payments/${encodeURIComponent(form.get("paymentId"))}/proof`, form); }
export async function reviewPayment(_previous, form) { return perform(`proofs/${encodeURIComponent(form.get("proofId"))}/review`, Object.fromEntries(form)); }
export async function requestCancel(_previous, form) { return perform(`bookings/${encodeURIComponent(form.get("bookingId"))}/cancellation`, Object.fromEntries(form)); }
export async function completeCancel(_previous, form) { return perform(`bookings/${encodeURIComponent(form.get("bookingId"))}/cancel`, Object.fromEntries(form)); }
export async function refundRecorded(_previous, form) { return perform(`bookings/${encodeURIComponent(form.get("bookingId"))}/refund`, Object.fromEntries(form)); }
export async function cashReceived(_previous, form) { return perform(`bookings/${encodeURIComponent(form.get("bookingId"))}/cash`, {}); }
