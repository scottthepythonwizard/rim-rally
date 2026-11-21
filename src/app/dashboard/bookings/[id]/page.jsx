import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/server/staff-session";
import { bookingDetails } from "@/server/staff-data";
import { formatDay, formatTime, money } from "@/features/booking/scheduling";
import { Status } from "@/features/staff/booking-ui";
import { ActionForm } from "@/features/staff/forms";
import { uploadProof, reviewPayment, requestCancel, completeCancel, refundRecorded, cashReceived } from "@/features/staff/booking-actions";
import { fieldClass, primaryClass, secondaryClass } from "@/features/staff/styles";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableDetails } from "@/components/ui/backend-unavailable";

export const metadata = { title: "Booking details" };

export default async function BookingDetailsPage({ params }) {
  if (!STAFF_API_AVAILABLE) return <UnavailableDetails title="Booking details" sections={["Customer", "Reservation", "Payment and proof", "Cancellation and refund"]} />;
  await requireStaff();
  const { id } = await params;
  const b = await bookingDetails(id);
  if (!b) notFound();
  return <>
    <Link href="/dashboard/bookings" className="inline-flex min-h-11 items-center text-sm underline">Back to bookings</Link>
    <h1 className="mt-3 font-editorial text-3xl">Booking details</h1>
    <p className="mt-3 break-all font-mono text-xs">{b.id}</p>
    <div className="mt-6 grid items-start gap-6 md:grid-cols-2">
      <section className="rounded-xl border border-ink/20 p-5"><h2 className="font-editorial text-xl">Customer</h2>
        <p className="mt-3 break-words font-semibold">{b.name}</p><p className="mt-2 break-all text-sm">{b.email}</p><p className="mt-2 text-sm">{b.mobile}</p>
        <Link href={`/dashboard/customers/${b.customer_id}`} className="mt-3 inline-flex min-h-11 items-center text-sm underline">Customer bookings</Link>
      </section>
      <section className="rounded-xl border border-ink/20 p-5"><h2 className="font-editorial text-xl">Reservation</h2>
        <p className="mt-3 text-sm">{b.type === "court" ? "Court booking" : "Open Play registration"} · {b.source === "walk-in" ? "Walk-in" : "Online"}</p>
        <p className="mt-2 break-words text-sm">{b.court}{b.session_name ? ` · ${b.session_name}` : ""}</p><p className="mt-2 text-sm">{formatDay(b.starts.slice(0, 10), true)}</p>
        <p className="mt-2 text-sm">{formatTime(b.starts)}–{formatTime(b.ends)}{b.starts.slice(0, 10) !== b.ends.slice(0, 10) ? " (ends next day)" : ""} · Asia/Manila</p><div className="mt-3"><Status value={b.status} /></div>
        {b.sessionAvailable && <Link href={`/dashboard/sessions/${b.session_id}`} className="mt-3 inline-flex min-h-11 items-center text-sm underline">Open session participants</Link>}
      </section>
    </div>
    <section className="mt-6 rounded-xl border border-ink/20 p-5">
      <h2 className="font-editorial text-xl">Payment and proof</h2>
      <p className="mt-3 break-words text-sm">Payment recipient: {b.payee || "Not recorded"} · Account: {b.account || "Not recorded"}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span className="tabular-nums">{money(b.amount)}</span><span className="uppercase">{b.payment.method}</span><Status value={b.payment.status} /></div>
      <p className="mt-3 text-sm">Proof submission and payment verification are recorded separately. Check the received payment before verifying proof.</p>
      {b.source === "walk-in" && b.status === "reserved" && b.payment.status === "pending" && <ActionForm action={cashReceived} confirm="Have you received the full amount in cash? This confirms the booking." className="mt-4"><input type="hidden" name="bookingId" value={b.id} /><button className={secondaryClass}>Record cash received</button></ActionForm>}
      {!b.proofs.length && <p className="mt-3 text-sm">No proof submitted.</p>}
      {b.proofs.map((proof) => <article key={proof.id} className="mt-4 border-t border-ink/20 pt-4">
        <div className="flex flex-wrap items-center gap-3"><a href={`/dashboard/proofs/${proof.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center break-all text-sm underline">Open proof · {proof.name}</a><Status value={proof.status} /></div>
        <p className="mt-2 text-xs">Submitted {new Date(proof.submitted).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Manila</p>
        {proof.reason && <p className="mt-2 break-words text-sm">Review reason · {proof.reason}</p>}
        {proof.status === "submitted" && b.status !== "canceled" && <ActionForm action={reviewPayment} confirm="Record this payment-proof review?" className="mt-3 max-w-lg">
          <input name="proofId" type="hidden" value={proof.id} />
          <label className="block text-sm">Review outcome<select className={fieldClass} name="outcome" required defaultValue=""><option value="" disabled>Choose an outcome</option><option value="verified">Verify received payment</option><option value="rejected">Reject proof</option></select></label>
          <label className="block text-sm">Review reason (required for rejection)<textarea className={fieldClass} name="reason" maxLength={1000} rows={3} /></label>
          <label className="block text-sm">Verified transaction reference (required for verification)<input className={fieldClass} name="bank_reference" maxLength={120} autoComplete="off" spellCheck={false} /></label>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="checked" required className="mt-1" />I checked the actual payment account, recipient, amount and transfer reference.</label>
          <button className={primaryClass}>Save proof review</button>
        </ActionForm>}
      </article>)}
      {b.status !== "canceled" && b.payment.status === "pending" && !b.proofs.some((p) => p.status === "submitted") && <ActionForm action={uploadProof} className="mt-5 max-w-lg">
        <input type="hidden" name="paymentId" value={b.payment.id} />
        <label className="block text-sm">Payment proof · JPEG or PNG, up to 5 MB<input className={`${fieldClass} mt-2`} name="proof" type="file" accept="image/jpeg,image/png" required /></label>
        <label className="block text-sm">Payment transaction reference<input name="reference" required maxLength={120} autoComplete="off" className={fieldClass} /></label>
        <button className={secondaryClass}>Submit payment proof</button>
      </ActionForm>}
    </section>
    <section className="mt-6 rounded-xl border border-ink/20 p-5"><h2 className="font-editorial text-xl">Cancellation and refund</h2>
      {!b.cancellation && b.status !== "canceled" && <ActionForm action={requestCancel} className="mt-4 max-w-lg">
        <input type="hidden" name="bookingId" value={b.id} />
        <label className="block text-sm">Cancellation reason<textarea className={fieldClass} name="reason" required maxLength={1000} rows={3} /></label>
        <button className={secondaryClass}>Record cancellation request</button>
      </ActionForm>}
      {b.cancellation && <>
        <div className="mt-3 flex flex-wrap gap-3"><Status value={b.cancellation.status} /><span className="text-sm">Refund <Status value={b.cancellation.refund_status} /></span></div>
        <p className="mt-3 break-words text-sm">{b.cancellation.reason}</p><p className="mt-2 text-xs">Requested {new Date(b.cancellation.requested).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Manila</p>
        {b.cancellation.decision && <p className="mt-3 break-words text-sm">Decision · {b.cancellation.decision}</p>}
        {b.cancellation.status === "requested" && <ActionForm action={completeCancel} confirm="Cancel this booking and release its court time or seat?" className="mt-4 max-w-lg">
          <input type="hidden" name="bookingId" value={b.id} />
          {b.payment.status === "succeeded" && <label className="block text-sm">Refund decision<select className={fieldClass} name="refund" required defaultValue=""><option value="" disabled>Choose a refund decision</option><option value="pending">Refund pending</option><option value="refunded">Refund already sent</option><option value="not_due">No refund due under agreed policy</option></select></label>}
          <label className="block text-sm">Decision and refund reference, if applicable<textarea className={fieldClass} name="decision" maxLength={1000} required rows={3} /></label>
          <button className={primaryClass}>Complete cancellation</button>
        </ActionForm>}
        {b.cancellation.status === "completed" && b.cancellation.refund_status === "pending" && <ActionForm action={refundRecorded} confirm="Record that this refund has been sent?" className="mt-4 max-w-lg">
          <input type="hidden" name="bookingId" value={b.id} />
          <label className="block text-sm">Refund reference or explanation<textarea className={fieldClass} name="decision" required maxLength={1000} rows={3} /></label>
          <button className={secondaryClass}>Record refund sent</button>
        </ActionForm>}
      </>}
    </section>
    <details className="mt-6"><summary className="min-h-11 cursor-pointer py-3 text-sm underline">Booking activity</summary><ul className="space-y-3 text-sm">{b.history.map((event, i) => <li key={i} className="break-words border-b border-ink/15 pb-3"><span className="capitalize">{event.action.replaceAll("_", " ")}</span> · {new Date(event.at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · {event.actor || "Guest"}{event.note && <p className="mt-1">{event.note}</p>}</li>)}</ul></details>
  </>;
}
