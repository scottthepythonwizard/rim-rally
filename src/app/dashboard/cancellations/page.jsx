import { STAFF_API_AVAILABLE } from "@/config/backend";
import Link from "next/link";
import { requireStaff } from "@/server/staff-session";
import { listCancellations } from "@/server/staff-data";
import { Status } from "@/features/staff/booking-ui";

export default async function CancellationsPage() {
  await requireStaff();
  const rows = await listCancellations();
  return <><h1 className="font-editorial text-3xl">Cancellations</h1><p className="my-4 text-sm">Up to 100 requests, with pending requests first. Booking cancellation and refund progress are tracked separately.</p>
    {STAFF_API_AVAILABLE && !rows.length && <p role="status">No cancellation requests yet.</p>}
    <ul className="space-y-4">{rows.map((r) => <li key={r.id} className="break-words rounded-xl border border-ink/20 p-5 [content-visibility:auto]"><Link className="inline-flex min-h-11 items-center font-semibold underline" href={`/dashboard/bookings/${r.booking_id}`}>{r.name} · {r.court}</Link><p className="my-2 text-sm">Requested {new Date(r.requested).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} (Manila)</p><p className="mb-3 whitespace-pre-wrap text-sm">{r.reason}</p><Status value={r.status} /> <Status value={r.refund_status} /></li>)}</ul></>;
}
