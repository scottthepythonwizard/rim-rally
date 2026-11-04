import { describe, expect, it } from "vitest";
import { validateBooking } from "@/services/payment-operations";

const receipt = () => ({ id: "booking", holdId: "hold", status: "confirmed", reference: "RR-123", facilityName: "Rim & Rally", courtName: "Court 1", context: { facilityId: "rim-and-rally", sport: "pickleball", date: "2030-01-01", mode: "court" }, slots: [{ courtId: "pickleball-1", startAt: "2030-01-01T23:00:00+08:00", endAt: "2030-01-02T00:00:00+08:00" }], session: null, amount: 40000, currency: "PHP", method: "gcash", ticketToken: "opaque-demo-token" });

describe("confirmed receipt validation", () => {
  it("accepts the final hourly interval ending next-day midnight", () => { expect(validateBooking(receipt(), "booking").amount).toBe(40000); });
  it("normalizes malformed context instead of throwing a raw parsing error", () => {
    for (const date of [undefined, null, "not-a-date", "2030-02-31"]) {
      const b = receipt(); b.context.date = date;
      expect(() => validateBooking(b, "booking")).toThrow(expect.objectContaining({ code: "INVALID_BOOKING" }));
    }
  });
  it("rejects Open Play outside the acknowledged date and operating hours", () => {
    for (const [startAt, endAt] of [["2030-01-02T09:00:00+08:00", "2030-01-02T11:00:00+08:00"], ["2030-01-01T07:00:00+08:00", "2030-01-01T09:00:00+08:00"]]) {
      const b = receipt(); b.context.mode = "open-play"; b.slots = []; b.session = { name: "Session", courtName: "Court 1", startAt, endAt };
      expect(() => validateBooking(b, "booking")).toThrow(expect.objectContaining({ code: "INVALID_BOOKING" }));
    }
  });
  it("rejects an otherwise valid receipt for a different facility/date/sport/mode", () => {
    for (const [key, value] of [["date", "2030-01-02"], ["facilityId", "other"], ["sport", "basketball"], ["mode", "open-play"]]) {
      const expected = { context: { ...receipt().context, [key]: value } };
      expect(() => validateBooking(receipt(), "booking", expected)).toThrow(expect.objectContaining({ code: "BOOKING_MISMATCH" }));
    }
  });
  it("rejects missing court names rather than deriving labels from opaque IDs", () => {
    const b = receipt(); delete b.courtName;
    expect(() => validateBooking(b, "booking")).toThrow(expect.objectContaining({ code: "INVALID_BOOKING" }));
  });
});
