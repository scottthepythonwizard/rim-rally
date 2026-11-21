import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/staff-session";
import { listBookings, readCustomer } from "@/server/staff-data";
import { BookingList } from "@/features/staff/booking-ui";
import { secondaryClass } from "@/features/staff/styles";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableDetails } from "@/components/ui/backend-unavailable";

export default async function CustomerPage({ params, searchParams }) {
  if (!STAFF_API_AVAILABLE) return <UnavailableDetails title="Customer details" sections={["Contact information", "Booking history"]} />;
  await requireStaff();
  const { id } = await params, { page = "1" } = await searchParams;
  const c = await readCustomer(id);
  if (!c) notFound();
  const bookings = await listBookings({ customerId: id, page });
  return <><h1 className="break-words font-editorial text-3xl">{c.name}</h1><p className="mt-4 break-words text-sm">{c.email} · {c.mobile}</p>
    <Link className={`${secondaryClass} my-5`} href={`/dashboard/walk-in?customer=${c.id}`}>Book for this customer</Link>
    <h2 className="mb-4 font-editorial text-xl">Booking history</h2><BookingList bookings={bookings.slice(0, 50)} />
    {Number(page) > 1 && <Link className={secondaryClass} href={`?page=${Number(page) - 1}`}>Previous page</Link>}
    {bookings.length > 50 && <Link className={secondaryClass} href={`?page=${Number(page) + 1}`}>Next page</Link>}</>;
}
