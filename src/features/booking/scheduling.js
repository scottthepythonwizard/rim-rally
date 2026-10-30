export const TIME_ZONE = "Asia/Manila";

export function manilaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function addDays(date, amount) {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

export function atHour(date, hour) {
  return hour === 24 ? `${addDays(date, 1)}T00:00:00+08:00` : `${date}T${String(hour).padStart(2, "0")}:00:00+08:00`;
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value));
}

export function formatDay(date, long = false) {
  return new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, weekday: long ? "long" : "short", month: long ? "long" : "short", day: "numeric", ...(long ? { year: "numeric" } : {}) }).format(new Date(`${date}T12:00:00+08:00`));
}

export function money(centavos) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(centavos / 100);
}

export function normalizeOptions(params, today) {
  const sport = params.get("sport") === "basketball" ? "basketball" : "pickleball";
  const date = params.get("date");
  const scenarios = ["normal", "sold-out", "empty", "error", "slow", "malformed"];
  return {
    sport,
    date: validDate(date) && date >= today ? date : today,
    mode: params.get("mode") === "open-play" ? "open-play" : "court",
    court: params.get("court") || `${sport}-1`,
    scenario: scenarios.includes(params.get("scenario")) ? params.get("scenario") : "normal",
  };
}

export function selectable(slot, now = Date.now()) {
  return slot.status === "available" && new Date(slot.startAt).getTime() > now;
}

/** Removing an interior hour would split the booking and is rejected. */
export function toggleSlot(current, slot, now = Date.now()) {
  if (!selectable(slot, now)) return { slots: current, error: "That hour is no longer available. Choose another time." };
  const sameCourt = current.every((item) => item.courtId === slot.courtId);
  const source = sameCourt ? current : [];
  const next = source.some((item) => item.id === slot.id) ? source.filter((item) => item.id !== slot.id) : [...source, slot];
  next.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  if (next.some((item, index) => index && new Date(next[index - 1].endAt).getTime() !== new Date(item.startAt).getTime())) {
    return { slots: current, error: "Choose consecutive hours. Add or remove hours at either end of your selection." };
  }
  return { slots: next, error: null };
}

export function totalAmount(slots) { return slots.reduce((sum, slot) => sum + slot.amount, 0); }

export const initialSelection = { slots: [], session: null, message: "" };
export function selectionReducer(state, action) {
  switch (action.type) {
    case "TOGGLE_SLOT": {
      const result = toggleSlot(state.slots, action.slot, action.now);
      return { slots: result.slots, session: null, message: result.error || "" };
    }
    case "SESSION": return { slots: [], session: state.session?.id === action.session.id ? null : action.session, message: "" };
    case "CLEAR": return initialSelection;
    case "MESSAGE": return { ...state, message: action.message };
    case "RECONCILE": {
      const allSlots = action.data.courts?.flatMap((court) => court.slots) || [];
      const slots = state.slots.map((slot) => allSlots.find((fresh) => fresh.id === slot.id)).filter(Boolean);
      const freshSession = action.data.sessions?.find((session) => session.id === state.session?.id);
      const invalid = slots.length !== state.slots.length || slots.some((slot) => !selectable(slot, action.now)) || (state.session && (!freshSession || freshSession.registeredCount >= freshSession.capacity || new Date(freshSession.startAt).getTime() <= action.now));
      if (invalid) return { ...initialSelection, message: "Availability changed. Your previous selection was cleared; please choose again." };
      return { ...state, slots, session: freshSession || null };
    }
    default: return state;
  }
}
