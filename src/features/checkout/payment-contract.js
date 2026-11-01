/**
 * @typedef {Object} PaymentAttempt
 * @property {string} id
 * @property {string} holdId
 * @property {"gcash"|"maya"|"qrph"} method
 * @property {"PHP"} currency
 * @property {number} amount Integer centavos from the acknowledged service quote.
 * @property {"pending"|"succeeded"|"failed"|"cancelled"|"unknown"} status
 * @property {"none"|"pending"|"confirmed"} bookingStatus
 * @property {string=} bookingId
 * @property {string} serverNow ISO timestamp with explicit timezone.
 */

export const PAYMENT_METHODS = [
  { id: "gcash", name: "GCash", description: "Pay through your GCash wallet.", next: "Enter your wallet mobile number to continue." },
  { id: "maya", name: "Maya", description: "Pay through your Maya wallet.", next: "Enter your wallet mobile number to continue." },
  { id: "qrph", name: "QRPh", description: "Scan with a participating bank or e-wallet.", next: "View the demonstration QR and enter a reference." },
];

export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "cancelled", "unknown"];

/** A verified payment alone does not establish a confirmed court booking. */
export function canShowConfirmation(attempt) {
  return attempt?.status === "succeeded" && attempt.bookingStatus === "confirmed" && typeof attempt.bookingId === "string" && attempt.bookingId.length > 0;
}
