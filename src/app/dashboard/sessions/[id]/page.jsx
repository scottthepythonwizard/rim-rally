import { notFound } from "next/navigation";
import { requireStaff } from "@/server/staff-session";
import { readSchedule } from "@/server/staff-data";
import { listBookings } from "@/server/staff-data";
import { BookingList } from "@/features/staff/booking-ui";
import { formatDay, formatTime } from "@/features/booking/scheduling";
import Link from "next/link";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableDetails } from "@/components/ui/backend-unavailable";

export default async function ParticipantsPage({ params, searchParams }) {
  if (!STAFF_API_AVAILABLE) return <UnavailableDetails title="Session participants" sections={["Session details", "Participants"]} />;
  await requireStaff();
  const { id } = await params, { page = "1" } = await searchParams;
  const s = await readSchedule(id);
  if (!s) notFound();
  const rows = await listBookings({ sessionId: id, page });
  return <><h1 className="break-words font-editorial text-3xl">{s.name} participants</h1><p className="my-4 text-sm">{s.court} · {formatDay(s.starts.slice(0, 10), true)} · {formatTime(s.starts)}–{formatTime(s.ends)} (Manila) · Capacity {s.capacity}</p><p className="mb-4 text-sm">Includes canceled registrations for reference.</p><BookingList bookings={rows.slice(0, 50)} />
    <nav aria-label="Participant pages" className="my-5 flex gap-5">{Number(page) > 1 && <Link href={`?page=${Number(page) - 1}`}>Previous page</Link>}{rows.length > 50 && <Link href={`?page=${Number(page) + 1}`}>Next page</Link>}</nav></>;
}
