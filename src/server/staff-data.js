import "server-only";
import { djangoRequest, queryString } from "./django-client";
import { STAFF_API_AVAILABLE } from "@/config/backend";
// Empty presentation data keeps the disabled screens renderable. It is never
// shown as a successful backend result; the dashboard displays its pause notice.
const get = (path, filters, unavailable = []) => STAFF_API_AVAILABLE ? djangoRequest(`/staff/${path}${queryString(filters)}`) : Promise.resolve(unavailable);
export const listBookings = (filters) => get("bookings", filters);
export const bookingDetails = (id) => get(`bookings/${encodeURIComponent(id)}`, undefined, null);
export const listCustomers = (q = "") => get("customers", { q });
export const readCustomer = (id) => get(`customers/${encodeURIComponent(id)}`, undefined, null);
export const listCancellations = () => get("cancellations");
export const listSessions = (filters) => get("sessions", filters);
export const listSchedules = () => get("schedules");
export const readSchedule = (id) => get(`schedules/${encodeURIComponent(id)}`, undefined, null);
export const listAccounts = () => get("accounts");
export const listInvitations = () => get("invitations");
export const listCourts = () => get("courts");
