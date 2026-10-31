export const RECOVERY_KEY = "rim-rally:hold-recovery:v1";
export const contextKey = ({ facilityId, sport, date, mode }) => [facilityId, sport, date, mode].join("/");
export const holdState = { hold: null, credential: null, status: "recovering", message: "", step: "selection", verified: false };
export function holdReducer(state, action) {
  switch (action.type) {
    case "REQUEST": return { ...state, status: "securing", message: "", verified: false };
    case "ACK": return { ...state, hold: action.hold, credential: action.credential, status: "held", verified: true, message: action.message || "" };
    case "BROWSE": return { ...holdState, status: "browsing", message: action.message || "" };
    case "EXPIRED": return { ...holdState, status: "expired", message: "Your 10-minute hold has expired. Select available times again to start a new hold." };
    case "ERROR": return { ...state, status: action.uncertain ? "uncertain" : state.hold ? "held" : "browsing", verified: !action.uncertain && Boolean(state.hold), message: action.message };
    case "UNVERIFIED": return { ...state, verified: false };
    case "STEP": return { ...state, step: action.step };
    default: return state;
  }
}

export function remainingMs(expiresAt, anchor, monotonicNow) {
  return Math.max(0, Date.parse(expiresAt) - (anchor.serverTime + Math.max(0, monotonicNow - anchor.monotonicTime)));
}

export function normalizeMobile(value) {
  const compact = value.replace(/[\s()-]/g, "");
  return /^09\d{9}$/.test(compact) ? `+63${compact.slice(1)}` : /^\+639\d{9}$/.test(compact) ? compact : null;
}

export function validateGuest(guest) {
  const errors = {};
  if (guest.name.trim().length < 2) errors.name = "Enter your full name (at least two characters).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) errors.email = "Enter a valid email address.";
  if (!normalizeMobile(guest.mobile)) errors.mobile = "Use a Philippine mobile number, such as 09171234567 or +639171234567.";
  return errors;
}
