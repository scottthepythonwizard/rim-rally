"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { PAYMENT_RECOVERY } from "@/services/payments/payment-operations";
import { STAFF_API_AVAILABLE } from "@/config/backend";
import { UnavailableNotice } from "@/components/ui/backend-unavailable";

const field = "mt-2 min-h-11 w-full rounded-lg border border-ink/30 p-3 text-base";
const button = "mt-4 min-h-11 rounded-full border border-ink px-6 text-sm disabled:opacity-40";
function PaymentInstructions({ payment }) {
  const [src, setSrc] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    let objectUrl, alive = true;
    const controller = new AbortController();
    Promise.resolve().then(() => JSON.parse(sessionStorage.getItem(PAYMENT_RECOVERY) || "null"))
      .then((record) => fetch(endpoint(`/payment-attempts/${encodeURIComponent(payment.id)}/qr`), { headers: { "X-Guest-Recovery": record?.credential || "" }, signal: controller.signal, cache: "no-store" }))
      .then(async (response) => { if (!response.ok) throw new Error(); return response.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (alive) setSrc(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch(() => { if (alive) setError("Payment QR could not be loaded. Check with the facility before transferring money."); });
    return () => { alive = false; controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [payment.id]);
  return <section><h3 className="font-editorial text-xl">Facility payment instructions</h3><p className="mt-2 break-words text-sm">Payee: {payment.payee} · Account: {payment.account}</p><p className="mt-2 text-sm">Deadline: {new Date(payment.expiresAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })} · Manila</p>{src && <Image src={src} alt="Facility payment QR" width={224} height={224} unoptimized className="mt-4 h-56 w-56 object-contain" />}{error && <p role="alert" className="mt-3 text-sm">{error}</p>}</section>;
}
function endpoint(path) { return `${(process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "")}${path}`; }

export default function GuestManagement(props) {
  return STAFF_API_AVAILABLE ? <ActiveGuestManagement {...props} /> : <UnavailableNotice />;
}

function ActiveGuestManagement({ payment, bookingId, onUpdated }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const guard = useRef(false), errorMessage = useRef(null);
  useEffect(() => { if (error) errorMessage.current?.focus(); }, [error]);
  async function send(event, proof) {
    event.preventDefault();
    if (guard.current) return;
    if (!proof && !window.confirm("Send this cancellation request to staff? Your place stays reserved until staff process it.")) return;
    const form = event.currentTarget;
    guard.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const record = JSON.parse(sessionStorage.getItem(PAYMENT_RECOVERY) || "null");
      if (!record?.credential) throw new Error("Use the browser tab where you made this booking.");
      const body = new FormData(form);
      const response = await fetch(endpoint(proof ? `/payment-attempts/${payment.id}/proof` : `/bookings/${bookingId || payment.reservationId}/cancellations`), {
        method: "POST", headers: { "X-Guest-Recovery": record.credential, ...(proof ? {} : { "Content-Type": "application/json" }) },
        body: proof ? body : JSON.stringify({ reason: body.get("reason") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "The request could not be saved. Please try again.");
      setMessage(proof ? "Proof submitted. Staff will review your payment." : "Cancellation requested. Staff will review it and any refund decision.");
      form.reset(); onUpdated?.();
    } catch (e) { setError(e.message || "Unable to send your request. Please try again."); }
    finally { guard.current = false; setBusy(false); }
  }
  return <div className="no-print mt-6 space-y-5 border-t border-ink/25 pt-6">
    {payment?.status === "pending" && <PaymentInstructions payment={payment} />}
    {payment?.status === "pending" && <section><h3 className="font-editorial text-xl">Payment proof</h3><p className="mt-2 text-sm">{payment.proofStatus === "submitted" ? "Submitted — waiting for staff review." : payment.proofStatus === "rejected" ? `Rejected: ${payment.reviewReason}. Contact the facility about any transfer.` : "Upload proof after paying using the facility’s payment instructions. Uploading proof does not confirm payment."}</p>
      {payment.proofStatus !== "submitted" && <form onSubmit={(e) => send(e, true)}><fieldset disabled={busy}><label className="mt-3 block text-sm">PNG or JPEG (up to 5 MB)<input className={field} type="file" name="proof" accept="image/jpeg,image/png" required onChange={(event) => event.target.setCustomValidity(event.target.files?.[0]?.size > 5 * 1024 * 1024 ? "Choose a PNG or JPEG up to 5 MB." : "")} /></label><label className="mt-3 block text-sm">Payment transaction reference<input name="reference" required maxLength={120} autoComplete="off" spellCheck={false} autoCapitalize="none" className={field} /></label><button className={button}>{busy ? "Sending…" : "Upload payment proof"}</button></fieldset></form>}
    </section>}
    {(bookingId || payment?.reservationId) && <details><summary className="min-h-11 cursor-pointer py-3 text-sm underline">Request cancellation</summary><form onSubmit={(e) => send(e, false)}><fieldset disabled={busy}><label className="block text-sm">Cancellation reason<textarea name="reason" required maxLength={1000} className={field} /></label><p className="mt-2 text-sm">Staff confirm cancellations. Paid bookings require a refund decision.</p><button className={button}>{busy ? "Sending…" : "Send cancellation request"}</button></fieldset></form></details>}
    {message && <p role="status" className="text-sm">{message}</p>}{error && <p ref={errorMessage} tabIndex={-1} role="alert" className="text-sm">{error}</p>}
  </div>;
}
