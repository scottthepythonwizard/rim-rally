import { PAYMENT_METHODS, PAYMENT_STATUSES } from "@/features/checkout/payment-contract";
import { mockPaymentAttempt, PAYMENT_SCENARIOS } from "@/mocks/payments";
import { ApiError } from "./api-client";

/** Frontend method catalogue; live provider availability requires backend agreement. */
export function getPaymentMethods() { return structuredClone(PAYMENT_METHODS); }

/** Validate an API response before a checkout controller can use it. */
export function validatePaymentAttempt(value, expected = {}) {
  const valid = value && typeof value.id === "string" && value.id.length > 0 && typeof value.holdId === "string" && value.holdId.length > 0 && PAYMENT_METHODS.some((method) => method.id === value.method) && value.currency === "PHP" && Number.isSafeInteger(value.amount) && value.amount > 0 && PAYMENT_STATUSES.includes(value.status) && ["none", "pending", "confirmed"].includes(value.bookingStatus) && typeof value.serverNow === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value.serverNow) && Number.isFinite(Date.parse(value.serverNow));
  if (!valid || (value.bookingStatus === "confirmed" && (value.status !== "succeeded" || typeof value.bookingId !== "string" || !value.bookingId.length)) || (value.bookingId != null && (value.bookingStatus !== "confirmed" || typeof value.bookingId !== "string")) || (value.status === "succeeded" && value.bookingStatus === "none") || (value.status !== "succeeded" && value.bookingStatus !== "none")) throw new ApiError("INVALID_PAYMENT_RESPONSE", "The payment result could not be verified. Check its status before trying again.");
  for (const key of ["id", "holdId", "amount", "method"]) if (expected[key] !== undefined && value[key] !== expected[key]) throw new ApiError("PAYMENT_MISMATCH", "The payment result did not match this reservation. Check its status before continuing.");
  return value;
}

/** Static contract fixtures for tests; runtime checkout uses payment-operations. */
export function getPaymentPreview(scenario = "pending") {
  if (!PAYMENT_SCENARIOS.includes(scenario)) throw new ApiError("INVALID_SCENARIO", "Choose a supported payment preview scenario.");
  return validatePaymentAttempt(mockPaymentAttempt(scenario));
}
