import { atHour } from "@/features/booking/scheduling";

/** Demo inventory and rates, not approved facility pricing or court counts. */
export function mockAvailability({ facilityId, sport, date, scenario }, now = new Date()) {
  const serverNow = now.toISOString();
  if (scenario === "empty") return { facilityId, sport, date, serverNow, courts: [] };
  const courts = Array.from({ length: sport === "pickleball" ? 3 : 2 }, (_, index) => {
    const id = `${sport}-${index + 1}`;
    return {
      id, name: sport === "pickleball" ? `Court ${index + 1}` : `Half-court ${index + 1}`, kind: "Indoor",
      slots: Array.from({ length: 16 }, (_, position) => {
        const hour = position + 8;
        const peak = hour >= 17 && hour < 22;
        const marker = (position + index * 3 + Number(date.slice(-2))) % 11;
        const status = scenario === "sold-out" ? "booked" : marker === 4 || marker === 7 ? "booked" : marker === 6 ? "held" : "available";
        return { id: `${date}_${id}_${hour}`, courtId: id, startAt: atHour(date, hour), endAt: atHour(date, hour + 1), status, priceBand: peak ? "peak" : "off-peak", amount: sport === "pickleball" ? (peak ? 50000 : 35000) : (peak ? 80000 : 60000) };
      }),
    };
  });
  return { facilityId, sport, date, serverNow, courts };
}

export function mockOpenPlay({ facilityId, sport, date, scenario }, now = new Date()) {
  const capacity = sport === "pickleball" ? 16 : 12;
  return {
    facilityId, sport, date, serverNow: now.toISOString(),
    sessions: scenario === "empty" ? [] : [9, 13, 18, 21].map((hour, index) => ({
      id: `${date}_${sport}_open_${hour}`, name: ["Morning rallies", "Afternoon social", "After-hours play", "Night session"][index],
      courtId: `${sport}-1`, courtName: sport === "pickleball" ? "Court 1" : "Half-court 1", startAt: atHour(date, hour), endAt: atHour(date, hour + 2),
      registeredCount: scenario === "sold-out" || index === 2 ? capacity : index === 1 ? capacity - 1 : 6,
      capacity, amount: sport === "pickleball" ? 20000 : 25000, priceBand: hour >= 17 ? "peak" : "off-peak",
    })),
  };
}
