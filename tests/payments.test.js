import { describe, expect, it } from "vitest";
import { canShowConfirmation } from "@/features/checkout/payment-contract";
import { getPaymentMethods, getPaymentPreview, validatePaymentAttempt } from "@/services/payment-service";
import { PAYMENT_SCENARIOS } from "@/mocks/payments";

describe("Phase 4 contract foundation", () => {
  it("provides independent copies of the three supported methods", () => {
    const methods = getPaymentMethods(); expect(methods.map((method) => method.id)).toEqual(["gcash", "maya", "qrph"]);
    methods[0].name = "Changed"; expect(getPaymentMethods()[0].name).toBe("GCash");
  });
  it("validates each simulation fixture without submitting a payment", () => {
    for (const scenario of PAYMENT_SCENARIOS) expect(getPaymentPreview(scenario).currency).toBe("PHP");
    expect(() => getPaymentPreview("unexpected")).toThrow("supported payment preview");
  });
  it("permits confirmation only after payment and booking are both confirmed", () => {
    expect(canShowConfirmation(getPaymentPreview("success"))).toBe(true);
    for (const scenario of PAYMENT_SCENARIOS.filter((item) => item !== "success")) expect(canShowConfirmation(getPaymentPreview(scenario))).toBe(false);
  });
  it("rejects malformed, inconsistent and mismatched payment responses", () => {
    const valid = getPaymentPreview("pending");
    for (const broken of [null, {}, { ...valid, amount: "400" }, { ...valid, amount: -1 }, { ...valid, status: "paid" }, { ...valid, method: "unknown" }, { ...valid, bookingStatus: "confirmed", bookingId: "abc" }, { ...valid, serverNow: "invalid" }]) expect(() => validatePaymentAttempt(broken)).toThrow("could not be verified");
    for (const expected of [{ amount: 80000 }, { holdId: "another-hold" }, { id: "another-attempt" }, { method: "maya" }]) expect(() => validatePaymentAttempt(valid, expected)).toThrow("did not match");
  });
});
