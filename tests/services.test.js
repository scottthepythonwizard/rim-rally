import { afterEach, describe, expect, it, vi } from "vitest";
import { getSchedule, validateSchedule } from "@/services/booking/scheduling-service";
import { getJson, normalizeError } from "@/services/http/api-client";
import { mockAvailability } from "@/mocks/scheduling";

const query = { facilityId: "rim-and-rally", sport: "pickleball", date: "2030-01-01", scenario: "normal" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("schedule service boundaries", () => {
  it("validates real mock availability and empty responses", () => {
    expect(validateSchedule(mockAvailability(query), "court").courts).toHaveLength(3);
    expect(validateSchedule(mockAvailability({ ...query, scenario: "empty" }), "court").courts).toEqual([]);
  });
  it("rejects malformed prices, state labels, and missing hours", () => {
    for (const change of [{ amount: "350" }, { amount: -1 }, { amount: 2.5 }, { status: "mystery" }, { startAt: "invalid" }]) {
      const data = mockAvailability(query); Object.assign(data.courts[0].slots[0], change);
      expect(() => validateSchedule(data, "court")).toThrow("incomplete information");
    }
    const data = mockAvailability(query); data.courts[0].slots.pop();
    expect(() => validateSchedule(data, "court")).toThrow();
  });
  it("normalizes null entries, duplicate IDs and misordered hourly data", () => {
    for (const change of [(data) => { data.courts = [null]; }, (data) => { data.courts[0].slots[0] = null; }, (data) => { data.courts[0].slots[1].id = data.courts[0].slots[0].id; }, (data) => { data.courts[0].slots.reverse(); }]) {
      const data = mockAvailability(query); change(data);
      expect(() => validateSchedule(data, "court")).toThrow("incomplete information");
    }
  });
  it("normalizes unexpected error bodies without exposing server details", () => {
    expect(normalizeError("<html>stack trace</html>", 500)).toMatchObject({ retryable: true, code: "HTTP_500" });
    expect(normalizeError({ error: { message: "SECRET STACK" } }, 500).message).not.toContain("SECRET");
    expect(normalizeError(null, 409).message).toContain("Availability changed");
  });
  it("honors cancellation of slow mock responses", async () => {
    const controller = new AbortController();
    const pending = getSchedule({ ...query, scenario: "slow" }, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("supports sold-out, empty, service failure, and malformed scenarios", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "mock");
    expect((await getSchedule({ ...query, scenario: "sold-out" })).courts.every((court) => court.slots.every((slot) => slot.status === "booked"))).toBe(true);
    expect((await getSchedule({ ...query, scenario: "empty" })).courts).toEqual([]);
    await expect(getSchedule({ ...query, scenario: "error" })).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
    await expect(getSchedule({ ...query, scenario: "malformed" })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("blocks HTTP reads immediately while integration is paused", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(getJson("/availability")).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE", message: "Temporarily unavailable" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not contact an external backend even if an HTTP URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "http"); vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://example.test/api");
    vi.stubGlobal("fetch", vi.fn());
    await expect(getSchedule(query)).rejects.toMatchObject({ code: "TEMPORARILY_UNAVAILABLE" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
