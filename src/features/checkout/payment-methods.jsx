"use client";
import { useRef, useState } from "react";
import { getPaymentMethods } from "@/services/payment-service";
import { normalizeMobile } from "@/features/booking/hold-state";
import { money } from "@/features/booking/scheduling";
import TicketQR from "./ticket-qr";

const button = "min-h-11 rounded-full bg-ink px-6 font-editorial text-xs text-paper disabled:opacity-40";
export default function PaymentMethods({ holdValid, flow, onCheckout, initialPayment }) {
  const [selected, setSelected] = useState(initialPayment?.method || "");
  const [mobile, setMobile] = useState("");
  const [reference, setReference] = useState("");
  const [scenario, setScenario] = useState("success");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialog = useRef(null), trigger = useRef(null), guard = useRef(false);
  const methods = getPaymentMethods();
  const demo = process.env.NEXT_PUBLIC_API_MODE !== "http";
  function trapFocus(event) {
    if (event.key !== "Tab") return;
    const fields = [...dialog.current.querySelectorAll("input:not(:disabled), select:not(:disabled), button:not(:disabled), a[href], [tabindex='0']")];
    const first = fields[0], last = fields.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  async function submit(event) {
    event.preventDefault();
    if (guard.current) return;
    if (selected === "qrph" ? !/^[A-Za-z0-9-]{6,40}$/.test(reference) : !normalizeMobile(mobile)) { setError(selected === "qrph" ? "Enter a reference with 6–40 letters, digits or hyphens." : "Use 09171234567 or +639171234567."); return; }
    guard.current = true; setBusy(true); setError("");
    try {
      const verified = await flow.recover();
      if (!verified) { setError("Your hold must be verified before payment."); return; }
      const record = { key: crypto.randomUUID(), credential: flow.credential, holdId: verified.id, amount: verified.quote.totalAmount, method: selected, started: Date.now() };
      sessionStorage.setItem("rim-rally:payment-recovery:v1", JSON.stringify(record));
      dialog.current.close();
      onCheckout(record, { holdId: record.holdId, holdRevision: verified.revision, expectedAmount: record.amount, method: selected, guest: { ...flow.guest }, ...(selected === "qrph" ? { reference } : { mobile: normalizeMobile(mobile) }), ...(demo ? { scenario } : {}) });
    } catch { setError("Payment recovery could not be saved. Enable browser storage before continuing."); }
    finally { guard.current = false; setBusy(false); }
  }
  return <section aria-labelledby="payment-method-title" className="mt-6 border-t border-ink/20 pt-6">
    <h3 id="payment-method-title" className="font-editorial text-xl">Choose how you’ll pay</h3>
    <p className="mt-3 text-xs leading-6 text-ink/70">{demo ? "Demonstration checkout. No money will be collected. Payment references do not establish success." : "Your booking is confirmed only after the payment service verifies payment and allocation."}</p>
    <fieldset disabled={!holdValid || busy} className="mt-5 space-y-3 disabled:opacity-50"><legend className="sr-only">Payment method</legend>{methods.map((m) => <label key={m.id} className={`flex min-h-16 items-center gap-4 rounded-xl border p-4 ${selected === m.id ? "border-ink bg-tan/50" : "border-ink/20"}`}><input type="radio" name="payment-method" checked={selected === m.id} onChange={() => setSelected(m.id)} className="h-4 w-4 accent-ink" /><span><span className="block text-sm font-semibold">{m.name}</span><span className="text-xs">{m.description}</span></span></label>)}</fieldset>
    <button ref={trigger} type="button" disabled={!selected || !holdValid || !onCheckout || busy} onClick={() => { setError(""); setMobile(initialPayment?.mobile || flow.guest.mobile); setReference(initialPayment?.reference || ""); dialog.current.showModal(); }} className={`mt-5 w-full ${button}`}>Continue to payment</button>
    <dialog ref={dialog} onKeyDown={trapFocus} aria-labelledby="pay-title" onCancel={(e) => { if (busy) e.preventDefault(); }} onClose={() => { setMobile(""); setReference(""); trigger.current?.focus(); }} className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl bg-paper p-6 text-ink backdrop:bg-ink/60">
      <form onSubmit={submit} noValidate><h3 id="pay-title" className="font-editorial text-2xl">{demo ? "Simulated " : ""}{methods.find((m) => m.id === selected)?.name} checkout</h3><p className="mt-4 text-sm">Amount: {money(flow?.hold?.quote.totalAmount || 0)}</p><p className="mt-3 break-all text-[10px]">Payment identifier: {flow?.hold?.id}</p>
      {selected === "qrph" ? <><p className="mt-4 text-xs">{demo ? "DEMO QR — this is not a payable QRPh code." : "Live QRPh requires a provider-issued QR. Submission is unavailable until integration."}</p>{demo && <TicketQR token={`rim-rally:demo-payment:${flow?.hold?.id}`} label="Simulated payment QR, not payable" />}<label className="mt-4 block text-xs">Reference code<input aria-invalid={Boolean(error)} aria-describedby={error ? "payment-field-error" : undefined} required value={reference} maxLength={40} onChange={(e) => setReference(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-ink/30 p-3" /></label></> : <label className="mt-5 block text-xs">Wallet mobile number<input aria-invalid={Boolean(error)} aria-describedby={error ? "payment-field-error" : undefined} type="tel" autoComplete="tel" required maxLength={24} value={mobile} onChange={(e) => setMobile(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-ink/30 p-3" /><span className="mt-2 block">09171234567 or +639171234567</span></label>}
      {demo && <label className="mt-4 block text-xs">Demo payment outcome<select value={scenario} onChange={(e) => setScenario(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-ink/30 p-3">{[["success", "Success"], ["failed", "Failed"], ["unknown", "Uncertain, then recovered"], ["booking-pending", "Paid, allocation pending"], ["delayed", "Delayed over two minutes"], ["malformed", "Malformed result, then recovered"], ["invalid-fields", "Rejected fields"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
      {error && <p id="payment-field-error" role="alert" className="mt-4 text-sm">{error}</p>}<div className="mt-6 flex flex-wrap gap-3"><button disabled={busy || (!demo && selected === "qrph")} className={button}>{busy ? "Checking hold…" : demo ? "Start simulated payment" : "Submit payment"}</button><button type="button" disabled={busy} onClick={() => dialog.current.close()} className="min-h-11 px-4 text-xs underline">Back to review</button></div></form>
    </dialog>
  </section>;
}
