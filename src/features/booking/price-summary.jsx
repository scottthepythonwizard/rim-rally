import { formatDay, formatTime, money, totalAmount } from "./scheduling";
import { PriceBadge } from "./booking-matrix";

export default function PriceSummary({ date, sport, courts, slots, session, onClear, stale, disabled, children }) {
  const amount = session ? session.amount : totalAmount(slots);
  const hasSelection = slots.length > 0 || session;
  const court = courts?.find((item) => item.id === slots[0]?.courtId);
  return <aside aria-labelledby="summary-title" className="h-fit rounded-xl border border-ink/20 bg-tan/35 p-6 lg:sticky lg:top-6">
    <p className="text-[9px] tracking-[0.2em] uppercase">Make it a game</p><h2 id="summary-title" className="mt-3 font-editorial text-2xl">Your selection</h2>
    <p className="mt-5 text-sm capitalize">{sport} · {session ? "Open Play" : "Court reservation"}</p><p className="mt-2 text-xs leading-6">{formatDay(date, true)}</p>
    {!hasSelection && <p className="mt-6 border-t border-ink/20 pt-5 text-sm leading-7 text-ink/65">Choose consecutive hours on one court, or select one place in an Open Play session.</p>}
    {slots.length > 0 && <div className="mt-5 border-t border-ink/20 pt-5"><p className="text-sm font-semibold">{court?.name}</p><p className="mt-2 text-xs">{formatTime(slots[0].startAt)} – {formatTime(slots.at(-1).endAt)}{new Date(slots.at(-1).endAt).getTime() === new Date(`${date}T00:00:00+08:00`).getTime() + 86400000 ? " (+1 day)" : ""}</p><ul className="mt-4 space-y-3">{slots.map((slot) => <li key={slot.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{formatTime(slot.startAt)} <PriceBadge band={slot.priceBand} /></span><span>{money(slot.amount)}</span></li>)}</ul></div>}
    {session && <div className="mt-5 border-t border-ink/20 pt-5"><h3 className="text-sm font-semibold">{session.name}</h3><p className="mt-2 text-xs">{formatTime(session.startAt)} – {formatTime(session.endAt)}</p><p className="mt-3 text-xs">1 player · {session.courtName}</p></div>}
    <div className="mt-6 flex items-center justify-between border-t border-ink/20 pt-5"><span className="text-xs">{slots.length ? `${slots.length} ${slots.length === 1 ? "hour" : "hours"}` : session ? "1 place" : "Total"}</span><output aria-live="polite" aria-label="Selection total" className="font-editorial text-3xl">{money(amount)}</output></div>
    {hasSelection && <button type="button" onClick={onClear} disabled={disabled} className="mt-4 min-h-11 text-xs underline underline-offset-4 disabled:opacity-40">Cancel hold</button>}
    {stale && <p role="status" className="mt-3 text-xs leading-6">Availability needs refreshing before choosing more hours.</p>}
    {children}
    <p className="mt-5 border-t border-ink/20 pt-4 text-[11px] leading-6 text-ink/65">Temporary holds expire automatically. No confirmed booking or payment is made in this phase.</p>
  </aside>;
}
