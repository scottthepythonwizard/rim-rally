import { describe, expect, it } from "vitest";
import { createHoldEngine, HOLD_DURATION } from "@/mocks/hold-engine";
import { validateHold, validateAcknowledgement, validateRelease } from "@/services/hold-service";
import { contextKey, holdReducer, holdState, normalizeMobile, remainingMs, validateGuest } from "@/features/booking/hold-state";
import { validateSchedule } from "@/services/scheduling-service";
import { mockAvailability, mockOpenPlay } from "@/mocks/scheduling";

const context = { facilityId: "rim-and-rally", sport: "pickleball", date: "2030-01-01", mode: "court" };
const input = (...hours) => ({ ...context, slotIds: hours.map((hour) => `${context.date}_pickleball-1_${hour}`) });
const options = (credential = "guest-a", idempotencyKey = "request-a") => ({ credential, idempotencyKey });
function fixture() {
  let db = { version: 1, holds: [] }, clock = Date.parse("2029-12-31T00:00:00Z"), count = 0, queue = Promise.resolve();
  const engine = createHoldEngine({ read: () => structuredClone(db), write: (value) => { db = structuredClone(value); }, now: () => clock, random: () => `hold-${++count}`, hash: async (text) => `hash-of-${text.length}-${text.split("").reverse().join("")}`, lock: (work) => { const next = queue.then(work); queue = next.catch(() => {}); return next; } });
  return { engine, advance: (time) => { clock += time; }, database: () => db, now: () => clock };
}

describe("acknowledged temporary holds", () => {
  it("creates a ten-minute hold using service pricing, with a valid quote", async () => {
    const { engine, now } = fixture(); const hold = await engine.create({ ...input(8), amount: 1, guestName: "must-not-persist" }, options());
    expect(Date.parse(hold.expiresAt) - now()).toBe(HOLD_DURATION);
    expect(validateHold(hold).quote.totalAmount).toBe(40000);
    expect(JSON.stringify(hold)).not.toContain("must-not-persist");
  });
  it("replays the same creation without starting a new deadline", async () => {
    const f = fixture(); const first = await f.engine.create(input(8), options()); f.advance(120000);
    const retry = await f.engine.create(input(8), options());
    expect(retry.id).toBe(first.id); expect(retry.expiresAt).toBe(first.expiresAt);
  });
  it("extends hours atomically and preserves expiry and authoritative total", async () => {
    const f = fixture(); const first = await f.engine.create(input(8), options()); f.advance(90000);
    const edited = await f.engine.update(first.id, input(8, 9), { ...options("guest-a", "edit-a"), revision: first.revision });
    expect(edited.expiresAt).toBe(first.expiresAt); expect(edited.quote.totalAmount).toBe(80000);
    expect((await f.engine.update(first.id, input(8, 9), { ...options("guest-a", "edit-a"), revision: first.revision })).revision).toBe(edited.revision);
  });
  it("has exactly one winner when two tabs claim the same slot", async () => {
    const { engine } = fixture();
    const results = await Promise.allSettled([engine.create(input(8), options()), engine.create(input(8), options("guest-b", "request-b"))]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.find((item) => item.status === "rejected").reason.code).toBe("CONFLICT");
  });
  it("rejects a conflicting update without modifying the acknowledged selection", async () => {
    const { engine } = fixture(); const original = await engine.create(input(8), options());
    await engine.create(input(10), options("guest-b", "request-b"));
    await expect(engine.update(original.id, input(8, 9, 10), { ...options("guest-a", "edit-a"), revision: original.revision })).rejects.toMatchObject({ code: "CONFLICT" });
    const unchanged = await engine.get(original.id, options());
    expect(unchanged.slots).toHaveLength(1); expect(unchanged.expiresAt).toBe(original.expiresAt);
  });
  it("rejects gaps and stale revisions", async () => {
    const { engine } = fixture(); const first = await engine.create(input(8), options());
    await expect(engine.update(first.id, input(8, 10), { ...options("guest-a", "gap"), revision: first.revision })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(engine.update(first.id, input(8, 9), { ...options("guest-a", "stale"), revision: 0 })).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
  });
  it("requires the recovery credential and releases cancelled resources", async () => {
    const { engine } = fixture(); const first = await engine.create(input(8), options());
    await expect(engine.get(first.id, options("wrong"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(engine.release(first.id, options("wrong"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await engine.release(first.id, options());
    await engine.release(first.id, options());
    await expect(engine.get(first.id, options())).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
    expect((await engine.create(input(8), options("guest-b", "request-b"))).slots).toHaveLength(1);
  });
  it("expires without renewal, including retry of an expired create", async () => {
    const f = fixture(); const first = await f.engine.create(input(8), options()); f.advance(HOLD_DURATION);
    await expect(f.engine.get(first.id, options())).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
    await expect(f.engine.create(input(8), options())).rejects.toMatchObject({ code: "HOLD_EXPIRED" });
    expect((await f.engine.create(input(8), options("guest-b", "request-b"))).id).not.toBe(first.id);
  });
  it("protects the final Open Play place and marks ownership without increasing registered players", async () => {
    const { engine } = fixture(); const sessionInput = { ...context, mode: "open-play", sessionId: "2030-01-01_pickleball_open_13" };
    const first = await engine.create(sessionInput, options());
    await expect(engine.create(sessionInput, options("guest-b", "request-b"))).rejects.toMatchObject({ code: "CONFLICT" });
    const data = { sessions: [first.session] };
    const own = await engine.overlay(data, "guest-a");
    const other = await engine.overlay(data, "guest-b");
    expect(own.sessions[0]).toMatchObject({ registeredCount: 15, heldCount: 1, heldByYou: true });
    expect(other.sessions[0].heldByYou).toBe(false);
    await engine.release(first.id, options()); expect((await engine.create(sessionInput, options("guest-b", "request-b"))).session.id).toBe(sessionInput.sessionId);
  });
  it("validates malformed quotes and selections before presentation", async () => {
    const { engine } = fixture(); const first = await engine.create(input(8), options());
    for (const broken of [null, {}, { ...first, quote: null }, { ...first, quote: { ...first.quote, totalAmount: 1 } }, { ...first, quote: { ...first.quote, items: [{ id: "wrong", amount: 40000 }] } }, { ...first, slots: [null] }]) expect(() => validateHold(broken)).toThrow("incomplete information");
    expect(() => validateAcknowledgement(first, input(9))).toThrow("did not match");
    expect(() => validateAcknowledgement(first, input(8), "wrong-id")).toThrow("did not match");
    expect(() => validateRelease(null)).toThrow("could not be verified");
    expect(() => validateRelease({ released: false })).toThrow("could not be verified");
  });
});

describe("hold UI state and guest input", () => {
  it("rejects ambiguous availability ownership and invalid held counts", () => {
    const privateData = mockAvailability(context);
    privateData.courts[0].slots[0].heldByYou = "false";
    expect(() => validateSchedule(privateData, "court")).toThrow("incomplete information");
    for (const fields of [{ heldCount: "1" }, { heldCount: -1 }, { heldCount: 100 }, { heldByYou: "false" }, { heldByYou: true, heldCount: 0 }]) {
      const data = mockOpenPlay(context); Object.assign(data.sessions[0], fields);
      expect(() => validateSchedule(data, "open-play")).toThrow("incomplete information");
    }
  });
  it("never marks an unacknowledged or uncertain hold as verified", () => {
    expect(holdReducer(holdState, { type: "REQUEST" })).toMatchObject({ status: "securing", verified: false });
    const current = holdReducer(holdState, { type: "ACK", hold: { id: "known" }, credential: "opaque" });
    expect(holdReducer(current, { type: "ERROR", uncertain: true, message: "timeout" })).toMatchObject({ hold: { id: "known" }, verified: false, status: "uncertain" });
    expect(holdReducer(current, { type: "EXPIRED" })).toMatchObject({ hold: null, step: "selection", verified: false });
  });
  it("calculates countdown from server expiry plus monotonic elapsed time", () => {
    const start = Date.parse("2030-01-01T00:00:00Z");
    const anchor = { serverTime: start, monotonicTime: 500 };
    expect(remainingMs(new Date(start + HOLD_DURATION).toISOString(), anchor, 125500)).toBe(475000);
    expect(remainingMs(new Date(start + HOLD_DURATION).toISOString(), anchor, 900000)).toBe(0);
  });
  it("normalizes Philippine numbers and flags missing guest details", () => {
    expect(normalizeMobile("0917 123 4567")).toBe("+639171234567");
    expect(normalizeMobile("+63 (917) 123-4567")).toBe("+639171234567");
    expect(normalizeMobile("123")).toBeNull();
    expect(Object.keys(validateGuest({ name: "", email: "bad", mobile: "bad" }))).toHaveLength(3);
    expect(validateGuest({ name: "Demo Guest", email: "demo@example.test", mobile: "09171234567" })).toEqual({});
    expect(contextKey(context)).not.toContain("guest");
  });
});
