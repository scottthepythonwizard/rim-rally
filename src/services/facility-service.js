import { facility } from "@/mocks/fixtures";

/** Read-only mock service. UI components never access a database. */
export async function getFacility(id) {
  return id === facility.id ? structuredClone(facility) : null;
}

export async function listFacilities({ sport } = {}) {
  return !sport || facility.sports.includes(sport) ? [structuredClone(facility)] : [];
}
