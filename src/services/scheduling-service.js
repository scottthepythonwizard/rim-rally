import { mockAvailability, mockOpenPlay } from "@/mocks/scheduling";
import { ApiError, getJson } from "./api-client";
import { atHour, validDate } from "@/features/booking/scheduling";
import { getBrowserHoldEngine } from "@/mocks/hold-engine";

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

const timestamp = (value) => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const validMoney = (value) => Number.isSafeInteger(value) && value >= 0;
const validOwnership = (item) => item.heldByYou === undefined || typeof item.heldByYou === "boolean";

/** Validate untrusted responses before UI use. Reject partial or ambiguous prices. */
export function validateSchedule(data, mode) {
  const items = mode === "court" ? data?.courts : data?.sessions;
  let valid = timestamp(data?.serverNow) && validDate(data?.date) && Array.isArray(items) && items.every((item) => item && typeof item === "object");
  if (valid && mode === "court") {
    valid = new Set(items.map((court) => court.id)).size === items.length && items.every((court) => typeof court.id === "string" && typeof court.name === "string" && typeof court.kind === "string" && Array.isArray(court.slots) && court.slots.length === 16 && court.slots.every((slot) => slot && typeof slot === "object") && new Set(court.slots.map((slot) => slot.id)).size === 16 && court.slots.every((slot, index) =>
      typeof slot.id === "string" && slot.courtId === court.id && timestamp(slot.startAt) && timestamp(slot.endAt) && Date.parse(slot.startAt) === Date.parse(atHour(data.date, index + 8)) && Date.parse(slot.endAt) === Date.parse(atHour(data.date, index + 9)) && validMoney(slot.amount) && ["available", "held", "booked"].includes(slot.status) && validOwnership(slot) && (!slot.heldByYou || slot.status === "held") && ["peak", "off-peak"].includes(slot.priceBand)));
  } else if (valid) {
    valid = new Set(items.map((session) => session.id)).size === items.length && items.every((session) => typeof session.id === "string" && typeof session.name === "string" && typeof session.courtId === "string" && typeof session.courtName === "string" && timestamp(session.startAt) && timestamp(session.endAt) && Date.parse(session.startAt) >= Date.parse(atHour(data.date, 8)) && Date.parse(session.endAt) <= Date.parse(atHour(data.date, 24)) && Date.parse(session.endAt) > Date.parse(session.startAt) && validMoney(session.amount) && Number.isInteger(session.registeredCount) && Number.isInteger(session.capacity) && session.capacity > 0 && session.registeredCount >= 0 && session.registeredCount <= session.capacity && validOwnership(session) && (session.heldCount === undefined || (Number.isInteger(session.heldCount) && session.heldCount >= 0 && session.registeredCount + session.heldCount <= session.capacity)) && (!session.heldByYou || session.heldCount > 0) && ["peak", "off-peak"].includes(session.priceBand));
  }
  if (!valid) throw new ApiError("INVALID_RESPONSE", "The schedule service returned incomplete information. Please try again.", { retryable: true });
  return data;
}

/**
 * @typedef {Object} ScheduleQuery
 * @property {string} facilityId
 * @property {'pickleball'|'basketball'} sport
 * @property {string} date Asia/Manila calendar date, YYYY-MM-DD.
 * @property {'normal'|'sold-out'|'empty'|'error'|'slow'|'malformed'} [scenario]
 */
export async function getSchedule(query, { mode = "court", signal, credential } = {}) {
  let data;
  if (process.env.NEXT_PUBLIC_API_MODE === "http") {
    const params = new URLSearchParams({ facilityId: query.facilityId, sport: query.sport, date: query.date });
    data = await getJson(`/${mode === "court" ? "availability" : "open-play"}?${params}`, { signal, headers: credential ? { "X-Guest-Recovery": credential } : {} });
  } else {
    await delay(query.scenario === "slow" ? 2400 : 250, signal);
    if (query.scenario === "error") throw new ApiError("DEMO_UNAVAILABLE", "The demo schedule is temporarily unavailable. Try again or change the demo scenario.", { retryable: true });
    data = query.scenario === "malformed" ? { courts: "unexpected" } : mode === "court" ? mockAvailability(query) : mockOpenPlay(query);
    if (query.scenario !== "malformed") data = await getBrowserHoldEngine().overlay(data, credential);
  }
  const result = validateSchedule(data, mode);
  if (result.facilityId !== query.facilityId || result.sport !== query.sport || result.date !== query.date) throw new ApiError("MISMATCHED_RESPONSE", "The schedule response did not match your selected day. Please refresh.", { retryable: true });
  return result;
}
