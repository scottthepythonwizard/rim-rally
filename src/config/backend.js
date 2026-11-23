// Build-time opt-in for the Django payment integration. Off preserves paused UI.
export const STAFF_API_AVAILABLE = process.env.NEXT_PUBLIC_BACKEND_ENABLED === "1";
export const UNAVAILABLE_MESSAGE = "Temporarily unavailable";
export const bookingApiAvailable = () => STAFF_API_AVAILABLE || process.env.NEXT_PUBLIC_API_MODE === "mock";
export const scheduleAvailable = () => process.env.NEXT_PUBLIC_BACKEND_ENABLED !== "0";

export function isScheduleRead(method, path) {
  return method === "GET" && (path === "/availability" || path === "/open-play");
}
