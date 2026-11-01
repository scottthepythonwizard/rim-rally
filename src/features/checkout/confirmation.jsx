"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getBooking, PAYMENT_RECOVERY } from "@/services/payment-operations";
import { formatDay, formatTime, money } from "@/features/booking/scheduling";
import TicketQR from "./ticket-qr";

export default function Confirmation({ bookingId }) {
  const [booking, setBooking] = useState(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const [qrReady, setQrReady] = useState(false);
  const ready = useCallback(() => setQrReady(true), []);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const recovery = JSON.parse(sessionStorage.getItem(PAYMENT_RECOVERY) || "null");
        if (!recovery?.credential) throw new Error("Open this pass in the browser tab used for checkout. Booking IDs alone do not grant access.");
        const data = await getBooking(bookingId, recovery.credential, recovery);
        if (active) { setBooking(data); setError(""); }
      } catch (e) { if (active) setError(e.message || "Your pass could not be loaded. Please check again."); }
    }
    void load(); return () => { active = false; };
  }, [bookingId, retry]);
  if (!booking) return <section className="mx-auto max-w-xl p-8"><h1 className="font-editorial text-2xl">{error ? "Pass unavailable" : "Preparing your pass…"}</h1>{error && <><p role="alert" className="mt-4 text-sm leading-7">{error}</p><button onClick={() => setRetry((v) => v + 1)} className="mt-5 min-h-11 rounded-full border px-6 text-xs">Try again</button></>}</section>;
  const start = booking.session?.startAt || booking.slots[0].startAt;
  const end = booking.session?.endAt || booking.slots.at(-1).endAt;
  const court = booking.session?.courtName || (booking.context.sport === "basketball" ? "Basketball half-court" : `Court ${booking.slots[0].courtId.split("-").at(-1)}`);
  const demo = process.env.NEXT_PUBLIC_API_MODE !== "http";
  return <section className="mx-auto max-w-3xl px-5 py-12 md:py-20">
    <div className="no-print mb-8"><p className="text-[10px] tracking-widest uppercase">Your next game is booked</p><h1 className="mt-3 font-editorial text-4xl">See you on court.</h1><p className="mt-4 text-sm leading-7">{demo ? "Demo booking confirmed. No payment was collected. This pass is not valid for admission." : "Keep your digital pass for check-in."}</p></div>
    <article aria-label="Digital booking pass" className="digital-pass break-inside-avoid rounded-2xl border border-ink/30 bg-white p-6 md:p-10"><p className="text-xs tracking-widest uppercase">Rim & Rally Sports Hub</p><h2 className="mt-3 font-editorial text-3xl">{demo ? "Demonstration pass" : "Digital pass"}</h2><p className="mt-3 break-all font-mono text-lg">{booking.reference}</p>
      <dl className="mt-6 grid gap-5 border-y border-ink/20 py-6 text-sm sm:grid-cols-2">{[["Guest", booking.guestName || "Guest — details cleared after refresh"], ["Sport", booking.context.sport], ["Facility", booking.facilityName], ["Court / session", `${court}${booking.session ? ` · ${booking.session.name} · 1 place` : ""}`], ["Date", formatDay(booking.context.date, true)], ["Time · Asia/Manila", `${formatTime(start)}–${formatTime(end)}${end.slice(0, 10) !== start.slice(0, 10) ? " (ends following day)" : ""}`], ["Amount", money(booking.amount)], ["Payment", booking.method.toUpperCase()]].map(([label, value]) => <div key={label}><dt className="text-[10px] tracking-widest uppercase">{label}</dt><dd className="mt-2 break-words capitalize">{value}</dd></div>)}</dl>
      <div className="mt-6"><TicketQR token={booking.ticketToken} onReady={ready} /><p className="mt-2 text-center text-[10px]">{demo ? "DEMO ONLY · Not valid for entry" : "Present at check-in · verification required"}</p></div>
    </article>
    <div className="no-print mt-6 flex flex-wrap gap-3"><button disabled={!qrReady} onClick={() => window.print()} className="min-h-11 rounded-full bg-ink px-6 font-editorial text-xs text-paper">Print / Save as PDF</button><Link href="/" className="flex min-h-11 items-center rounded-full border border-ink px-6 text-xs">Back to home</Link><Link href="/book/rim-and-rally" onClick={() => sessionStorage.removeItem(PAYMENT_RECOVERY)} className="flex min-h-11 items-center px-4 text-xs underline">Book another game</Link></div>
  </section>;
}
