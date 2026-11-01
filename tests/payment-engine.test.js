import { describe, expect, it } from "vitest";
import { createHoldEngine, HOLD_DURATION } from "@/mocks/hold-engine";
import { validateBooking } from "@/services/payment-operations";
import { canShowConfirmation } from "@/features/checkout/payment-contract";

async function fixture() {
  let db = { version: 1, holds: [] }, now = Date.parse("2029-12-31T00:00:00Z"), n = 0, queue = Promise.resolve();
  const engine = createHoldEngine({ read: () => structuredClone(db), write: (value) => { db = structuredClone(value); }, now: () => now, random: () => `test-${++n}`, hash: async (v) => `hash:${v}`, lock: (work) => { const p = queue.then(work); queue = p.catch(() => {}); return p; } });
  const options = { credential: "secret", idempotencyKey: "hold-key" };
  const context = { facilityId: "rim-and-rally", sport: "pickleball", date: "2030-01-01", mode: "court" };
  const hold = await engine.create({ ...context, slotIds: ["2030-01-01_pickleball-1_8"] }, options);
  const input = { holdId: hold.id, method: "gcash", guest: { name: "Demo Person", email: "player@example.test", mobile: "09171234567" }, mobile: "+639171234567" };
  const paymentOptions = { credential: "secret", idempotencyKey: "payment-key" };
  return { engine, input, hold, options, paymentOptions, advance: (ms) => { now += ms; }, db: () => db };
}

describe("atomic demo payments and confirmed passes", () => {
  for (const method of ["gcash", "maya", "qrph"]) it(`${method}: only service settlement confirms, with opaque QR token`, async () => {
    const f = await fixture();
    const p = await f.engine.startPayment({ ...f.input, method, reference: "DEMO123" }, f.paymentOptions);
    expect(canShowConfirmation(p)).toBe(false); f.advance(3000);
    const done = await f.engine.checkPayment(p.id, f.options);
    expect(canShowConfirmation(done)).toBe(true);
    const b = validateBooking(await f.engine.booking(done.bookingId, f.options), done.bookingId);
    expect(b.amount).toBe(40000); expect(b.ticketToken).toContain("demo-ticket");
    expect(JSON.stringify(f.db())).not.toMatch(/Demo Person|player@example|09171234567|\+639171234567/);
    await expect(f.engine.booking(done.bookingId, { credential: "other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("replays concurrent duplicate submission and rejects a second operation", async () => {
    const f = await fixture();
    const [a,b] = await Promise.all([f.engine.startPayment(f.input, f.paymentOptions), f.engine.startPayment(f.input, f.paymentOptions)]);
    expect(a.id).toBe(b.id); expect(f.db().payments).toHaveLength(1);
    await expect(f.engine.startPayment(f.input, { ...f.paymentOptions, idempotencyKey: "new" })).rejects.toMatchObject({ code: "PAYMENT_EXISTS" });
    expect((await f.engine.checkPayment("payment-key", f.options)).id).toBe(a.id);
  });
  it("keeps pending allocation beyond expiry, cannot release it, and settles once", async () => {
    const f = await fixture(); const p = await f.engine.startPayment(f.input, f.paymentOptions); f.advance(HOLD_DURATION + 1);
    await expect(f.engine.release(f.hold.id, f.options)).rejects.toMatchObject({ code: "PAYMENT_PENDING" });
    const a = await f.engine.checkPayment(p.id, f.options), b = await f.engine.checkPayment(p.id, f.options);
    expect(a.bookingId).toBe(b.bookingId);
    const overlay = await f.engine.overlay({ courts: [{ slots: [{ id: f.hold.slots[0].id }] }] });
    expect(overlay.courts[0].slots[0].status).toBe("booked");
  });
  it("failure permits retry with a fresh key; cancelled failure releases the hold", async () => {
    const f = await fixture(); const p = await f.engine.startPayment({ ...f.input, scenario: "failed" }, f.paymentOptions); f.advance(3000);
    expect((await f.engine.checkPayment(p.id, f.options)).status).toBe("failed");
    const retry = await f.engine.startPayment(f.input, { ...f.paymentOptions, idempotencyKey: "retry" });
    expect(retry.id).not.toBe(p.id);
  });
  it("cancels a failed attempt but never an uncertain one", async () => {
    const f = await fixture(); const p = await f.engine.startPayment({ ...f.input, scenario: "failed" }, f.paymentOptions);
    await expect(f.engine.cancelPayment(p.id, f.options)).rejects.toMatchObject({ code: "PAYMENT_PENDING" });
    f.advance(3000); await f.engine.checkPayment(p.id, f.options);
    expect((await f.engine.cancelPayment(p.id, f.options)).status).toBe("cancelled");
    expect(f.db().holds[0].released).toBe(true);
  });
  it("does not allow an old failed attempt to cancel a newer pending attempt", async () => {
    const f = await fixture(); const p = await f.engine.startPayment({ ...f.input, scenario: "failed" }, f.paymentOptions); f.advance(3000); await f.engine.checkPayment(p.id, f.options);
    await f.engine.startPayment(f.input, { ...f.paymentOptions, idempotencyKey: "new" });
    await expect(f.engine.cancelPayment(p.id, f.options)).rejects.toMatchObject({ code: "PAYMENT_PENDING" });
  });
  it("holds success with allocation pending until a booking exists", async () => {
    const f = await fixture(); const p = await f.engine.startPayment({ ...f.input, scenario: "booking-pending" }, f.paymentOptions); f.advance(3000);
    const interim = await f.engine.checkPayment(p.id, f.options); expect(interim.status).toBe("succeeded"); expect(canShowConfirmation(interim)).toBe(false);
    f.advance(6000); expect(canShowConfirmation(await f.engine.checkPayment(p.id, f.options))).toBe(true);
  });
  it("rejects expired holds and invalid mobile/reference without creating attempts", async () => {
    const f = await fixture();
    await expect(f.engine.startPayment({ ...f.input, mobile: "invalid" }, f.paymentOptions)).rejects.toMatchObject({ code: "INVALID_FIELDS" });
    await expect(f.engine.startPayment({ ...f.input, method: "qrph", reference: "x" }, f.paymentOptions)).rejects.toMatchObject({ code: "INVALID_FIELDS" });
    f.advance(HOLD_DURATION + 1); await expect(f.engine.startPayment(f.input, f.paymentOptions)).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
  });
  it("recovers unknown and malformed status without a second payment", async () => {
    for (const scenario of ["unknown", "malformed"]) {
      const f = await fixture(); const p = await f.engine.startPayment({ ...f.input, scenario }, f.paymentOptions);
      if (scenario === "malformed") await expect(f.engine.checkPayment(p.id, f.options)).rejects.toMatchObject({ code: "INVALID_PAYMENT_RESPONSE" });
      else expect((await f.engine.checkPayment(p.id, f.options)).status).toBe("unknown");
      f.advance(9000); expect(canShowConfirmation(await f.engine.checkPayment(p.id, f.options))).toBe(true); expect(f.db().payments).toHaveLength(1);
    }
  });
});
