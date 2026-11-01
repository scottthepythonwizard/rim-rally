"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { submitPayment, checkPayment, cancelFailedPayment, PAYMENT_RECOVERY } from "@/services/payment-operations";
import { canShowConfirmation } from "./payment-contract";
import { RECOVERY_KEY } from "@/features/booking/hold-state";
import { money } from "@/features/booking/scheduling";

export default function PaymentStatus({ record: initial, input, onExit }) {
  const router = useRouter();
  const record = useRef(initial), running = useRef(false), mounted = useRef(false), posted = useRef(false);
  const [attempt, setAttempt] = useState(null), [error, setError] = useState(""), [rejected, setRejected] = useState(false), [busy, setBusy] = useState(false), [delayed, setDelayed] = useState(false);
  const save = useCallback((data) => {
    if (!mounted.current) return;
    const next = { ...record.current, id: data.id };
    sessionStorage.setItem(PAYMENT_RECOVERY, JSON.stringify(next)); record.current = next;
    setAttempt(data); setError("");
    if (canShowConfirmation(data)) {
      sessionStorage.removeItem(RECOVERY_KEY);
      router.replace(`/booking/${encodeURIComponent(data.bookingId)}/confirmation`);
    }
  }, [router]);
  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true; if (mounted.current) setBusy(true);
    try { save(await checkPayment(record.current)); }
    catch { if (mounted.current) setError("The payment outcome could not be verified. Keep this page or return later to check the same payment. Do not pay again."); }
    finally { running.current = false; if (mounted.current) setBusy(false); }
  }, [save]);
  useEffect(() => {
    mounted.current = true;
    if (input && !posted.current) {
      posted.current = true; running.current = true;
      void submitPayment(input, { credential: initial.credential, idempotencyKey: initial.key, amount: initial.amount }).then(save).catch((e) => {
        if (!mounted.current) return;
        const definitive = ["INVALID_FIELDS", "HOLD_EXPIRED", "HTTP_422", "HTTP_410"].includes(e.code);
        setRejected(definitive);
        setError(definitive ? `${e.message} ${Object.values(e.fieldErrors || {}).filter((v) => typeof v === "string").join(" ")}` : "Submission outcome is uncertain. Check this same payment before trying again.");
      }).finally(() => { running.current = false; if (mounted.current) setBusy(false); });
    } else void check();
    return () => { mounted.current = false; };
  }, [check, save, input, initial]);
  useEffect(() => {
    if (rejected || ["failed", "cancelled"].includes(attempt?.status) || canShowConfirmation(attempt)) return;
    const visibleCheck = () => { if (document.visibilityState === "visible") void check(); };
    const timer = setInterval(() => { setDelayed(Date.now() - initial.started >= 120000); visibleCheck(); }, 3000);
    window.addEventListener("online", visibleCheck); window.addEventListener("focus", visibleCheck); document.addEventListener("visibilitychange", visibleCheck);
    return () => { clearInterval(timer); window.removeEventListener("online", visibleCheck); window.removeEventListener("focus", visibleCheck); document.removeEventListener("visibilitychange", visibleCheck); };
  }, [check, initial.started, rejected, attempt]);
  function retry() { sessionStorage.removeItem(PAYMENT_RECOVERY); onExit(); }
  async function cancel() {
    if (running.current) return;
    running.current = true; setBusy(true);
    try { await cancelFailedPayment(record.current); sessionStorage.removeItem(PAYMENT_RECOVERY); sessionStorage.removeItem(RECOVERY_KEY); onExit({ cancelled: true }); }
    catch (e) { setError(e.message); }
    finally { running.current = false; setBusy(false); }
  }
  const failed = ["failed", "cancelled"].includes(attempt?.status);
  return <section aria-labelledby="status-title" className="mx-auto max-w-2xl rounded-2xl border border-ink/25 bg-paper p-6 md:p-10">
    <p className="text-[10px] tracking-widest uppercase">{process.env.NEXT_PUBLIC_API_MODE !== "http" ? "Simulated checkout" : "Checkout"}</p>
    <h2 id="status-title" className="mt-4 font-editorial text-3xl">{rejected ? "Check your payment details" : failed ? "Payment unsuccessful" : canShowConfirmation(attempt) ? "Preparing your pass…" : attempt?.status === "succeeded" ? "Payment received. Confirming your place…" : delayed ? "Payment is taking longer than usual" : "Checking your payment"}</h2>
    <p role="status" className="mt-5 text-sm leading-7">{failed ? "The service reported a failed payment. Retry only while your original hold remains valid, or cancel." : rejected ? "No payment was accepted by this request. Return to your reservation to correct the details or choose new times." : "Keep this payment identifier. If your hold timer ends, the service will reconcile the payment and booking before a result is shown."}</p>
    <dl className="mt-6 space-y-3 text-xs"><div><dt>Payment identifier</dt><dd className="mt-1 break-all font-mono">{attempt?.id || initial.key}</dd></div><div><dt>Amount</dt><dd>{money(initial.amount)}</dd></div></dl>
    {error && <p role="alert" className="mt-5 rounded-lg border border-ink/25 p-4 text-xs leading-6">{error}</p>}
    <div className="mt-6 flex flex-wrap gap-3">{failed || rejected ? <><button disabled={busy} onClick={retry} className="min-h-11 rounded-full bg-ink px-6 text-xs text-paper">Return to reservation</button>{failed && <button disabled={busy} onClick={cancel} className="min-h-11 rounded-full border border-ink px-6 text-xs">Cancel reservation</button>}</> : <button disabled={busy} onClick={check} className="min-h-11 rounded-full border border-ink px-6 text-xs disabled:opacity-40">{busy ? "Checking…" : "Check payment status"}</button>}</div>
  </section>;
}
