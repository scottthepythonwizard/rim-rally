import { describe, expect, it } from "vitest";
import { addDays, atHour, manilaDate, money, normalizeOptions, selectionReducer, initialSelection, toggleSlot, totalAmount, validDate } from "@/features/booking/scheduling";
import { mockAvailability, mockOpenPlay } from "@/mocks/scheduling";

const date = "2030-01-01";
const now = Date.parse("2029-12-31T00:00:00Z");
const slot = (hour, amount = 35000, courtId = "pickleball-1") => ({ id: `${courtId}_${hour}`, courtId, status: "available", startAt: atHour(date, hour), endAt: atHour(date, hour + 1), amount });

describe("Philippine scheduling", () => {
  it("uses Manila date even when the UTC date differs", () => expect(manilaDate("2026-10-31T17:00:00Z")).toBe("2026-11-01"));
  it("rejects invalid calendar dates and normalizes old URL dates", () => {
    expect(validDate("2026-02-30")).toBe(false);
    expect(validDate("2028-02-29")).toBe(true);
    expect(normalizeOptions(new URLSearchParams("date=2020-01-01&sport=unknown&mode=bad"), date)).toMatchObject({ date, sport: "pickleball", mode: "court" });
  });
  it("rolls dates across month and year boundaries", () => { expect(addDays("2026-12-31", 1)).toBe("2027-01-01"); expect(addDays("2028-02-28", 1)).toBe("2028-02-29"); });
  it("creates exactly 16 hours with next-day midnight as the end", () => {
    const data = mockAvailability({ facilityId: "rim-and-rally", sport: "basketball", date });
    for (const court of data.courts) {
      expect(court.slots).toHaveLength(16);
      expect(court.slots[0].startAt).toBe("2030-01-01T08:00:00+08:00");
      expect(court.slots.at(-1).endAt).toBe("2030-01-02T00:00:00+08:00");
    }
  });
});

describe("confirmed court inventory and hourly pricing", () => {
  it("provides one basketball half-court and PHP 400 hourly slots for both sports", () => {
    for (const sport of ["pickleball", "basketball"]) {
      const data = mockAvailability({ facilityId: "rim-and-rally", sport, date });
      expect(data.courts).toHaveLength(sport === "basketball" ? 1 : 3);
      for (const court of data.courts) {
        expect(court.slots).toHaveLength(16);
        expect(court.slots.every((item) => item.amount === 40000)).toBe(true);
        expect(new Set(court.slots.map((item) => item.priceBand))).toEqual(new Set(["peak", "off-peak"]));
      }
    }
  });
});
describe("selection and totals", () => {
  it("adds adjacent hours, including before the first selection", () => {
    const result = toggleSlot([slot(9)], slot(8), now);
    expect(result.error).toBeNull();
    expect(result.slots.map((item) => item.startAt)).toEqual([slot(8).startAt, slot(9).startAt]);
  });
  it("rejects gaps and removing interior hours", () => {
    expect(toggleSlot([slot(8)], slot(10), now).slots).toEqual([slot(8)]);
    const current = [slot(8), slot(9), slot(10)];
    expect(toggleSlot(current, slot(9), now).slots).toEqual(current);
    expect(toggleSlot(current, slot(10), now).slots).toHaveLength(2);
  });
  it("changes courts by clearing the previous court selection", () => expect(toggleSlot([slot(8)], slot(12, 60000, "basketball-1"), now).slots).toEqual([slot(12, 60000, "basketball-1")]));
  it("rejects booked, held, and elapsed slots", () => {
    for (const status of ["held", "booked"]) expect(toggleSlot([], { ...slot(8), status }, now).slots).toEqual([]);
    expect(toggleSlot([], slot(8), Date.parse(slot(8).startAt)).slots).toEqual([]);
  });
  it("sums mixed prices in integer centavos", () => { expect(totalAmount([slot(16, 35000), slot(17, 50000)])).toBe(85000); expect(money(85000)).toContain("850"); expect(money(35050)).toContain("350.50"); });
  it("clears a selection if refreshing shows a conflicting booking", () => {
    const selected = slot(8);
    const state = { slots: [selected], session: null, message: "" };
    const next = selectionReducer(state, { type: "RECONCILE", data: { courts: [{ slots: [{ ...selected, status: "booked" }] }] }, now });
    expect(next.slots).toHaveLength(0); expect(next.message).toContain("Availability changed");
  });
  it("refreshes prices rather than retaining a stale quote", () => {
    const next = selectionReducer({ ...initialSelection, slots: [slot(8)] }, { type: "RECONCILE", data: { courts: [{ slots: [slot(8, 40000)] }] }, now });
    expect(totalAmount(next.slots)).toBe(40000);
  });
  it("allows one Open Play session and clears it when capacity fills", () => {
    const session = mockOpenPlay({ facilityId: "rim-and-rally", sport: "pickleball", date }).sessions[1];
    const selected = selectionReducer(initialSelection, { type: "SESSION", session });
    expect(selected.session.capacity - selected.session.registeredCount).toBe(1);
    expect(selectionReducer(selected, { type: "RECONCILE", data: { sessions: [{ ...session, registeredCount: session.capacity }] }, now }).session).toBeNull();
  });
});
