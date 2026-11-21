import Link from "next/link";
import { formatDay, formatTime, money } from "@/features/booking/scheduling";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableNotice } from "@/components/ui/backend-unavailable";

const labels = {
  reserved: "Reserved · payment pending", confirmed: "Confirmed", canceled: "Canceled",
  pending: "Pending", succeeded: "Verified / paid", cancelled: "Canceled", failed: "Failed",
  submitted: "Submitted · awaiting review", verified: "Verified", rejected: "Rejected", not_submitted: "Not submitted",
  requested: "Requested", completed: "Completed", not_required: "Not required", not_due: "No refund due", refunded: "Refund recorded",
};

export function Status({ value }) {
  return <span className="inline-block rounded-full border border-ink/25 bg-tan/40 px-3 py-1 text-xs">{labels[value] || value}</span>;
}

export function BookingList({ bookings }) {
  if (!STAFF_API_AVAILABLE) return <UnavailableNotice />;
  if (!bookings.length) return <p role="status" className="rounded-xl border border-dashed border-ink/25 p-6 text-sm">No bookings match these filters.</p>;
  return <div className="space-y-3" aria-label="Bookings">{bookings.map((b) => <article key={b.id} className="rounded-xl border border-ink/20 p-5 [content-visibility:auto]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h2 className="min-w-0 break-words font-editorial text-xl"><Link className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-ink/70" href={`/dashboard/bookings/${b.id}`}>{b.name}</Link></h2>
      <Status value={b.status} />
    </div>
    <p className="mt-2 break-words text-sm">{b.type === "court" ? "Court booking" : "Open Play registration"} · {b.court}{b.session_name ? ` · ${b.session_name}` : ""} · {b.source === "walk-in" ? "Walk-in" : "Online"}</p>
    <p className="mt-2 text-sm">{formatDay(b.starts.slice(0, 10), true)} · {formatTime(b.starts)}–{formatTime(b.ends)}{b.ends.slice(0, 10) !== b.starts.slice(0, 10) ? " (ends next day)" : ""}</p>
    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span className="tabular-nums">{money(b.amount)}</span><span>Payment <Status value={b.payment_status} /></span><span>Proof <Status value={b.proof_status || "not_submitted"} /></span></div>
  </article>)}</div>;
}
