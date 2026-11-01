import { requestJson, ApiError } from "./api-client";
import { getBrowserHoldEngine } from "@/mocks/hold-engine";
import { validatePaymentAttempt } from "./payment-service";
import { atHour, validDate } from "@/features/booking/scheduling";

const guestNames = new Map();
export const PAYMENT_RECOVERY = "rim-rally:payment-recovery:v1";
const http = () => process.env.NEXT_PUBLIC_API_MODE === "http";
const headers = (o) => ({ "X-Guest-Recovery": o.credential, ...(o.idempotencyKey ? { "Idempotency-Key": o.idempotencyKey } : {}) });
export async function submitPayment(input, options) {
  if (!http()) guestNames.set(input.holdId, input.guest.name.trim());
  const data = http() ? await requestJson("/payment-attempts", { method: "POST", body: input, headers: headers(options) }) : await getBrowserHoldEngine().startPayment(input, options);
  return validatePaymentAttempt(data, { holdId: input.holdId, method: input.method, amount: options.amount });
}
export async function checkPayment(record) {
  const path = record.id ? `/payment-attempts/${encodeURIComponent(record.id)}` : `/payment-attempts/by-key/${encodeURIComponent(record.key)}`;
  const data = http() ? await requestJson(path, { headers: headers(record) }) : await getBrowserHoldEngine().checkPayment(record.id || record.key, record);
  return validatePaymentAttempt(data, { ...(record.id ? { id: record.id } : {}), holdId: record.holdId, method: record.method, amount: record.amount });
}
export async function cancelFailedPayment(record) {
  // The proposed live contract has no provider cancellation agreement yet.
  if (http()) throw new ApiError("CANCELLATION_UNAVAILABLE", "Payment cancellation needs assistance from the facility. Keep your payment identifier.");
  return validatePaymentAttempt(await getBrowserHoldEngine().cancelPayment(record.id || record.key, record));
}
export function validateBooking(b, id, expected = {}) {
  const time = (v) => typeof v === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
  const slots = b?.slots;
  const selection = b?.context?.mode === "court" ? Array.isArray(slots) && slots.length > 0 && slots.every((s, i) => s && typeof s.courtId === "string" && s.courtId === slots[0].courtId && time(s.startAt) && time(s.endAt) && Date.parse(s.endAt) - Date.parse(s.startAt) === 3600000 && Date.parse(s.startAt) >= Date.parse(atHour(b.context.date, 8)) && Date.parse(s.endAt) <= Date.parse(atHour(b.context.date, 24)) && (!i || Date.parse(s.startAt) === Date.parse(slots[i - 1].endAt))) : b?.context?.mode === "open-play" && b.session && typeof b.session.name === "string" && typeof b.session.courtName === "string" && time(b.session.startAt) && time(b.session.endAt) && Date.parse(b.session.endAt) > Date.parse(b.session.startAt);
  if (!b || b.id !== id || b.status !== "confirmed" || typeof b.holdId !== "string" || !["pickleball", "basketball"].includes(b.context?.sport) || !validDate(b.context?.date) || !selection || typeof b.facilityName !== "string" || typeof b.reference !== "string" || !b.reference || typeof b.ticketToken !== "string" || !b.ticketToken || b.ticketToken.length > 2000 || !Number.isSafeInteger(b.amount) || b.amount <= 0 || b.currency !== "PHP" || !["gcash", "maya", "qrph"].includes(b.method)) throw new ApiError("INVALID_BOOKING", "The confirmed pass could not be verified. Check again before printing.");
  for (const key of ["holdId", "amount", "method"]) if (expected[key] !== undefined && b[key] !== expected[key]) throw new ApiError("BOOKING_MISMATCH", "The pass did not match this payment. Check its status again.");
  return b;
}
export async function getBooking(id, credential, expected) {
  const data = http() ? await requestJson(`/bookings/${encodeURIComponent(id)}`, { headers: { "X-Guest-Recovery": credential } }) : await getBrowserHoldEngine().booking(id, { credential });
  if (!http()) { const recovery = JSON.parse(sessionStorage.getItem(PAYMENT_RECOVERY) || "null"); data.guestName = guestNames.get(recovery?.holdId); }
  if (http() && (typeof data?.guestName !== "string" || !data.guestName.trim())) throw new ApiError("INVALID_BOOKING", "The pass is missing the guest name. Check again before printing.");
  return validateBooking(data, id, expected);
}
