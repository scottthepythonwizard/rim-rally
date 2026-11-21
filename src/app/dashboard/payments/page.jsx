import { requireStaff } from "@/server/staff-session";
import { listBookings } from "@/server/staff-data";
import { BookingList } from "@/features/staff/booking-ui";
import { fieldClass, primaryClass } from "@/features/staff/styles";
import Link from "next/link";

export default async function PaymentsPage({ searchParams }) {
  await requireStaff();
  const query = await searchParams;
  const rows = await listBookings({ ...query, payment: query.payment ?? "pending" });
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const link = (p) => `?${new URLSearchParams({ payment: query.payment || "", page: String(p) })}`;
  return <><h1 className="font-editorial text-3xl">Payments</h1><p className="mt-3 text-sm">Open a booking to review submitted proof. Uploaded proof alone does not confirm payment.</p>
    <form className="my-6 flex flex-wrap items-end gap-3"><div><label htmlFor="payment-status">Payment status</label><select id="payment-status" name="payment" defaultValue={query.payment || "pending"} className={fieldClass}><option value="pending">Awaiting payment review</option><option value="succeeded">Payment verified</option><option value="cancelled">Payment canceled</option><option value="">All payments</option></select></div><button className={primaryClass}>Filter payments</button></form>
    <BookingList bookings={rows.slice(0, 50)} /><nav aria-label="Payment pages" className="mt-5 flex gap-5">{page > 1 && <Link href={link(page - 1)}>Previous page</Link>}{rows.length > 50 && <Link href={link(page + 1)}>Next page</Link>}</nav></>;
}
