import { formatTime, money } from "./scheduling";
import { PriceBadge } from "./booking-matrix";

export default function OpenPlay({ sessions, selection, now, blocked, onSelect }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    {sessions.map((session) => {
      const full = session.registeredCount + (session.heldCount || 0) >= session.capacity && !session.heldByYou;
      const elapsed = new Date(session.startAt).getTime() <= now;
      const selected = selection?.id === session.id;
      const remaining = Math.max(0, session.capacity - session.registeredCount - (session.heldCount || 0));
      return <article key={session.id} className={`flex flex-col rounded-xl border p-5 ${selected ? "border-ink bg-tan/50" : "border-ink/15 bg-paper"}`}>
        <div className="flex items-center justify-between gap-2"><p className="text-[10px] tracking-widest uppercase">{session.courtName}</p><PriceBadge band={session.priceBand} /></div>
        <h3 className="mt-4 font-editorial text-xl">{session.name}</h3>
        <p className="mt-3 text-xs">{formatTime(session.startAt)} – {formatTime(session.endAt)}</p>
        <p className="mt-4 text-sm font-medium">{session.registeredCount} / {session.capacity} players registered</p>
        <meter min="0" max={session.capacity} value={session.registeredCount} aria-label={`${session.registeredCount} of ${session.capacity} places filled`} className="mt-2 h-2 w-full accent-ink" />
        <p className="mt-2 text-[11px] text-ink/65">{full ? "Session full" : `${remaining} ${remaining === 1 ? "place" : "places"} remaining`}</p>
        {session.heldCount > 0 && <p className="mt-1 text-[10px] text-ink/60">{session.heldCount} {session.heldCount === 1 ? "place temporarily held" : "places temporarily held"}{session.heldByYou ? " · one is yours" : ""}</p>}
        <div className="mt-6 flex flex-1 items-end justify-between gap-3"><p className="font-editorial text-lg">{money(session.amount)}<span className="block font-sans text-[10px] text-ink/60">per player</span></p><button type="button" disabled={blocked || full || elapsed} aria-pressed={selected} onClick={() => onSelect(session)} className={`min-h-11 rounded-full border border-ink px-4 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "bg-ink text-paper" : "hover:bg-tan"}`}>{elapsed ? "Session started" : full ? "Full" : selected ? "✓ Held for you" : "Select one place"}</button></div>
      </article>;
    })}
  </div>;
}
