import { ApiError } from "@/services/api-client";
import { validateGuest, normalizeMobile } from "@/features/booking/hold-state";

// Attached to the hold engine's lock/store so allocation and mock settlement are atomic.
export function paymentEngine({ lock, getStore, save, authorize, ensureActive, snapshot, now, random }) {
  const result = (p) => ({ id: p.id, holdId: p.holdId, method: p.method, currency: "PHP", amount: p.amount, status: p.status, bookingStatus: p.bookingId ? "confirmed" : p.status === "succeeded" ? "pending" : "none", ...(p.bookingId ? { bookingId: p.bookingId } : {}), serverNow: new Date(now()).toISOString() });
  async function locate(db, key, credential) {
    const p = (db.payments || []).find((p) => p.id === key || p.key === key);
    const h = db.holds.find((h) => h.id === p?.holdId);
    await authorize(h, credential);
    if (!p) throw new ApiError("NOT_FOUND", "No payment attempt was found. Check again before starting another payment.");
    return { p, h };
  }
  return {
    async startPayment(input, { credential, idempotencyKey }) {
      return lock(async () => {
        const db = getStore(); db.payments ||= [];
        const replay = db.payments.find((p) => p.key === idempotencyKey);
        if (replay) { await locate(db, replay.id, credential); return result(replay); }
        const h = db.holds.find((h) => h.id === input.holdId);
        await authorize(h, credential); ensureActive(h);
        if (input.holdRevision !== undefined && (input.holdRevision !== h.revision || input.expectedAmount !== h.quote.totalAmount)) throw new ApiError("INVALID_FIELDS", "Your selection changed. Review the current quote before payment.");
        if (h.paymentPending || h.booked) throw new ApiError("PAYMENT_EXISTS", "Check the existing payment before continuing.");
        const errors = validateGuest({ name: "", email: "", mobile: "", ...input.guest });
        if (!["gcash", "maya", "qrph"].includes(input.method)) errors.method = "Choose a payment method.";
        if (input.method !== "qrph" && !normalizeMobile(input.mobile || "")) errors.mobile = "Enter a Philippine mobile number.";
        if (input.method === "qrph" && !/^[A-Za-z0-9-]{6,40}$/.test(input.reference || "")) errors.reference = "Use 6–40 letters, digits or hyphens.";
        if (Object.keys(errors).length) throw new ApiError("INVALID_FIELDS", "Please check your payment details.", { fieldErrors: errors });
        const scenario = ["success", "failed", "unknown", "delayed", "booking-pending", "malformed", "invalid-fields"].includes(input.scenario) ? input.scenario : "success";
        if (scenario === "invalid-fields") throw new ApiError("INVALID_FIELDS", "The demo service rejected these details.", { fieldErrors: { mobile: "Try another mobile number." } });
        const p = { id: random(), key: idempotencyKey, holdId: h.id, method: input.method, amount: h.quote.totalAmount, status: "pending", scenario, started: now() };
        db.payments.push(p); h.paymentPending = true; save(db);
        return result(p);
      });
    },
    async checkPayment(key, { credential }) {
      return lock(async () => {
        const db = getStore(); const { p, h } = await locate(db, key, credential);
        const elapsed = now() - p.started;
        if (p.scenario === "malformed" && elapsed < 8000) throw new ApiError("INVALID_PAYMENT_RESPONSE", "The service returned an unexpected result. Check this payment again.");
        const delay = p.scenario === "delayed" ? 125000 : ["unknown", "booking-pending"].includes(p.scenario) ? 8000 : 2500;
        if (["pending", "unknown"].includes(p.status) && elapsed >= delay) {
          p.status = p.scenario === "failed" ? "failed" : "succeeded";
          h.paymentPending = false;
          if (p.status === "succeeded") { p.bookingId = random(); h.booked = true; p.ticketToken = `rim-rally:demo-ticket:${random()}`; }
        } else if (p.scenario === "unknown") p.status = "unknown";
        // Payment can succeed before allocation is confirmed; never issue a pass yet.
        if (p.scenario === "booking-pending" && elapsed >= 2500 && elapsed < delay) { save(db); return { ...result(p), status: "succeeded", bookingStatus: "pending" }; }
        save(db); return result(p);
      });
    },
    async cancelPayment(key, { credential }) {
      return lock(async () => {
        const db = getStore(); const { p, h } = await locate(db, key, credential);
        if (h.paymentPending || h.booked || !["failed", "cancelled"].includes(p.status)) throw new ApiError("PAYMENT_PENDING", "Check the payment outcome before cancellation. A hold release cannot cancel a payment.");
        p.status = "cancelled"; h.released = true; save(db); return result(p);
      });
    },
    async booking(id, { credential }) {
      return lock(async () => {
        const db = getStore(); const p = (db.payments || []).find((p) => p.bookingId === id);
        const { h } = await locate(db, p?.id, credential);
        if (!p || p.status !== "succeeded" || !h.booked) throw new ApiError("NOT_FOUND", "This booking is not confirmed.");
        const hold = snapshot(h);
        return { id, holdId: h.id, status: "confirmed", reference: `RR-${id.slice(0, 8).toUpperCase()}`, facilityName: "Rim & Rally Sports Hub", context: hold.context, slots: hold.slots, session: hold.session, amount: p.amount, currency: "PHP", method: p.method, ticketToken: p.ticketToken };
      });
    },
  };
}
