import Link from "next/link";
import { requireStaff } from "@/server/staff-session";
import { listBookings } from "@/server/staff-data";
import { BookingList } from "@/features/staff/booking-ui";
import { fieldClass, primaryClass, secondaryClass } from "@/features/staff/styles";

export const metadata = { title: "Bookings" };

export default async function BookingsPage({ searchParams }) {
  await requireStaff();
  const query = await searchParams;
  const rows = await listBookings(query);
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const pageLink = (number) => {
    const params = new URLSearchParams();
    for (const key of ["q", "date", "type", "status"]) if (typeof query[key] === "string") params.set(key, query[key]);
    params.set("page", number);
    return `/dashboard/bookings?${params}`;
  };
  return <>
    <div className="flex flex-wrap items-center justify-between gap-4"><h1 className="font-editorial text-3xl sm:text-4xl">Bookings</h1><Link href="/dashboard/walk-in" className={primaryClass}>Add walk-in booking</Link></div>
    <p className="mt-3 text-sm">Court bookings and Open Play registrations. All times are in Asia/Manila.</p>
    <form method="get" className="my-6 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">Name, email or booking ID<input name="q" type="search" maxLength={120} defaultValue={query.q || ""} className={fieldClass} autoComplete="off" /></label>
      <label className="text-sm">Date<input name="date" type="date" defaultValue={query.date || ""} className={fieldClass} /></label>
      <label className="text-sm">Booking type<select name="type" defaultValue={query.type || ""} className={fieldClass}><option value="">All types</option><option value="court">Court booking</option><option value="open-play">Open Play</option></select></label>
      <label className="text-sm">Booking status<select name="status" defaultValue={query.status || ""} className={fieldClass}><option value="">All statuses</option><option value="reserved">Reserved · payment pending</option><option value="confirmed">Confirmed</option><option value="canceled">Canceled</option></select></label>
      <div className="flex flex-wrap gap-3 sm:col-span-2"><button className={primaryClass}>Search bookings</button><Link className={secondaryClass} href="/dashboard/bookings">Reset filters</Link></div>
    </form>
    <BookingList bookings={rows.slice(0, 50)} />
    <nav aria-label="Booking result pages" className="mt-6 flex flex-wrap items-center gap-4 text-sm">
      {page > 1 && <Link className={secondaryClass} href={pageLink(page - 1)}>Previous page</Link>}
      <span>Page {page}</span>{rows.length > 50 && <Link className={secondaryClass} href={pageLink(page + 1)}>Next page</Link>}
    </nav>
  </>;
}
