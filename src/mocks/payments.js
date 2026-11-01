/** Contract fixtures only. No payment, booking, hold mutation or guest-data storage occurs here. */
export const PAYMENT_SCENARIOS = ["pending", "success", "booking-pending", "failed", "cancelled", "unknown"];

export function mockPaymentAttempt(scenario = "pending") {
  const status = scenario === "success" || scenario === "booking-pending" ? "succeeded" : scenario;
  return {
    id: "demo-payment-attempt", holdId: "demo-hold", method: "gcash", currency: "PHP", amount: 40000,
    status, bookingStatus: scenario === "success" ? "confirmed" : status === "succeeded" ? "pending" : "none",
    bookingId: scenario === "success" ? "demo-booking" : null,
    serverNow: "2026-11-01T08:00:00+08:00",
  };
}
