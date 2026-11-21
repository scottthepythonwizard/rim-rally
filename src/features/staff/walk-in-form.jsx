"use client";
import { useState } from "react";
import { ActionForm } from "./forms";
import { walkIn } from "./booking-actions";
import { fieldClass, primaryClass } from "./styles";
import { formatTime, money } from "@/features/booking/scheduling";

export default function WalkInForm({ customer, schedules, courts, date, requestKey }) {
  const [type, setType] = useState("court"), [sport, setSport] = useState("pickleball"), [day, setDay] = useState(date);
  const sessions = schedules.filter((s) => s.sport === sport && s.starts.slice(0, 10) === day);
  const hours = Array.from({ length: 17 }, (_, i) => i + 8);
  const hourLabel = (h) => h === 24 ? "12 AM (midnight)" : `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
  return <ActionForm action={walkIn} confirm="Create this walk-in booking and record the selected payment status?">
    <input type="hidden" name="key" value={requestKey} />
    <div className="grid gap-4 sm:grid-cols-2">
      <label>Customer name<input name="name" required maxLength={120} autoComplete="name" defaultValue={customer?.name} className={fieldClass} /></label>
      <label>Email address<input name="email" type="email" spellCheck={false} required maxLength={254} autoComplete="email" defaultValue={customer?.email} className={fieldClass} /></label>
      <label>Mobile number<input name="mobile" type="tel" required maxLength={24} autoComplete="tel" defaultValue={customer?.mobile} placeholder="e.g. 09171234567…" className={fieldClass} /></label>
      <div><label htmlFor="walk-in-type">Booking type</label><select id="walk-in-type" name="type" value={type} onChange={(e) => setType(e.target.value)} className={fieldClass}><option value="court">Court booking</option><option value="open-play">Open Play registration</option></select></div>
      <div><label htmlFor="walk-in-sport">Sport</label><select id="walk-in-sport" name="sport" value={sport} onChange={(e) => setSport(e.target.value)} className={fieldClass}><option value="pickleball">Pickleball</option><option value="basketball">Basketball</option></select></div>
      <label>Date<input name="date" type="date" min={date} value={day} onChange={(e) => setDay(e.target.value)} required className={fieldClass} /></label>
      {type === "court" ? <>
        <div><label htmlFor="walk-in-court">Court</label><select key={sport} id="walk-in-court" name="court" required className={fieldClass}>{courts.filter((c) => c.active && c.sport === sport).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label htmlFor="walk-in-start">Start time</label><select id="walk-in-start" name="start" className={fieldClass}>{hours.slice(0, -1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></div>
        <div><label htmlFor="walk-in-end">End time</label><select id="walk-in-end" name="end" defaultValue={9} className={fieldClass}>{hours.slice(1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}</select></div>
      </> : <div className="sm:col-span-2"><label htmlFor="walk-in-session">Session</label><select id="walk-in-session" key={`${sport}-${day}`} name="sessionId" required className={fieldClass}><option value="">Choose a session</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.court} · {formatTime(s.starts)}–{formatTime(s.ends)} · {money(s.amount)}</option>)}</select>{!sessions.length && <p role="status" className="mt-2 text-sm">No upcoming sessions on this date for this sport.</p>}</div>}
      <div><label htmlFor="walk-in-payment">Payment method</label><select id="walk-in-payment" name="method" className={fieldClass}><option value="unpaid">Unpaid — reserve for follow-up</option><option value="cash">Cash received — confirm booking</option><option value="gcash">GCash — awaiting proof review</option><option value="maya">Maya — awaiting proof review</option><option value="qrph">QRPh — awaiting proof review</option></select></div>
    </div>
    <p className="mt-4 text-sm leading-6">Django checks the court rate, available hours and session capacity before saving. Cash means the money has already been received. Other methods need payment proof and staff review.</p>
    <button className={primaryClass}>Create walk-in booking</button>
  </ActionForm>;
}
