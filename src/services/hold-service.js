import { ApiError, requestJson } from "./api-client";
import { getBrowserHoldEngine } from "@/mocks/hold-engine";
import { atHour, validDate } from "@/features/booking/scheduling";

export function validateHold(hold) {
  const items = hold?.quote?.items;
  const slots = hold?.slots;
  const context = hold?.context;
  const isTime = (value) => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  const validContext = context && typeof context.facilityId === "string" && ["pickleball", "basketball"].includes(context.sport) && validDate(context.date) && ["court", "open-play"].includes(context.mode);
  const validItems = Array.isArray(items) && items.length > 0 && items.every((item) => typeof item?.id === "string" && Number.isSafeInteger(item.amount) && item.amount >= 0) && new Set(items.map((item) => item.id)).size === items.length;
  let validSelection = false;
  if (validContext && validItems && Array.isArray(slots)) {
    const dayStart = Date.parse(atHour(context.date, 8));
    const dayEnd = Date.parse(atHour(context.date, 24));
    if (context.mode === "court") {
      validSelection = slots.length > 0 && slots.length <= 16 && slots.length === items.length && slots.every((slot, index) => slot && typeof slot.id === "string" && typeof slot.courtId === "string" && slot.courtId === slots[0].courtId && isTime(slot.startAt) && isTime(slot.endAt) && Date.parse(slot.startAt) >= dayStart && Date.parse(slot.endAt) <= dayEnd && Date.parse(slot.endAt) - Date.parse(slot.startAt) === 3600000 && (!index || Date.parse(slots[index - 1].endAt) === Date.parse(slot.startAt)) && ["peak", "off-peak"].includes(slot.priceBand) && items.some((item) => item.id === slot.id)) && new Set(slots.map((slot) => slot.id)).size === slots.length;
    } else {
      const session = hold.session;
      validSelection = slots.length === 0 && items.length === 1 && session && session.id === items[0].id && typeof session.name === "string" && typeof session.courtName === "string" && isTime(session.startAt) && isTime(session.endAt) && Date.parse(session.startAt) >= dayStart && Date.parse(session.endAt) <= dayEnd && Date.parse(session.endAt) > Date.parse(session.startAt);
    }
  }
  const valid = typeof hold?.id === "string" && hold.id.length > 0 && Number.isInteger(hold.revision) && hold.revision > 0 && validContext && validItems && validSelection && isTime(hold.expiresAt) && isTime(hold.serverNow) && Date.parse(hold.expiresAt) - Date.parse(hold.serverNow) <= 600000 && hold.quote?.currency === "PHP" && Number.isSafeInteger(hold.quote.totalAmount) && items.reduce((sum, item) => sum + item.amount, 0) === hold.quote.totalAmount;
  if (!valid) throw new ApiError("INVALID_RESPONSE", "The hold service returned incomplete information. Check your hold before continuing.", { retryable: true });
  if (hold.released) throw new ApiError("HOLD_EXPIRED", "Your hold is no longer active. Please select your time again.");
  // The acknowledged quote supplies display amounts; never trust cached selection prices.
  return { ...hold, slots: slots.map((slot) => ({ ...slot, amount: items.find((item) => item.id === slot.id)?.amount })), session: hold.session ? { ...hold.session, amount: hold.quote.totalAmount } : null };
}

async function holdRequest(operation, id, input, options) {
  if (process.env.NEXT_PUBLIC_API_MODE !== "http") {
    await new Promise((resolve) => setTimeout(resolve, 180));
    const engine = getBrowserHoldEngine();
    return operation === "create" ? engine.create(input, options) : operation === "update" ? engine.update(id, input, options) : engine[operation](id, options);
  }
  const method = operation === "create" ? "POST" : operation === "update" ? "PATCH" : operation === "release" ? "DELETE" : "GET";
  return requestJson(`/holds${id ? `/${encodeURIComponent(id)}` : ""}`, { method, body: operation === "create" ? input : operation === "update" ? { ...input, revision: options.revision } : undefined, headers: { "X-Guest-Recovery": options.credential, ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}) } });
}

export function validateAcknowledgement(hold, input, id) {
  const sameSlots = !input.slotIds || [...input.slotIds].sort().join("|") === hold.slots.map((slot) => slot.id).sort().join("|");
  const sameSession = !input.sessionId || input.sessionId === hold.session?.id;
  if (!sameSlots || !sameSession || (id && hold.id !== id)) throw new ApiError("INVALID_RESPONSE", "The hold acknowledgement did not match your selection. Check your hold before continuing.");
  return hold;
}

export async function createHold(input, options) { return validateAcknowledgement(validateHold(await holdRequest("create", null, input, options)), input); }
export async function updateHold(id, input, options) { return validateAcknowledgement(validateHold(await holdRequest("update", id, input, options)), input, id); }
export async function getHold(id, options) { return validateHold(await holdRequest("get", id, null, options)); }
export function validateRelease(result) {
  if (result?.released !== true) throw new ApiError("INVALID_RESPONSE", "Cancellation could not be verified. Check your hold before continuing.");
  return result;
}
export async function releaseHold(id, options) { return validateRelease(await holdRequest("release", id, null, options)); }
export async function expireDemoHold(id, options) {
  if (process.env.NEXT_PUBLIC_API_MODE === "http") throw new ApiError("DEMO_ONLY", "This action is only available in mock mode.");
  return getBrowserHoldEngine().expire(id, options);
}
