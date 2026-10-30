import { formatTime, money, selectable } from "./scheduling";

export function PriceBadge({ band }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${band === "peak" ? "border-ink/25 bg-tan text-ink" : "border-ink/15 text-ink/70"}`}>{band === "peak" ? "Peak" : "Off-peak"}</span>;
}

export function SlotLegend() {
  return <ul aria-label="Slot states" className="flex flex-wrap gap-x-5 gap-y-3 text-[11px]">
    {[["Available", "bg-paper border-ink/25"], ["Selected", "bg-ink border-ink"], ["Held", "bg-tan border-dashed border-ink/50"], ["Booked", "bg-court border-ink/10"]].map(([label, style]) => <li key={label} className="flex items-center gap-2"><span aria-hidden="true" className={`h-3 w-3 rounded-sm border ${style}`} />{label}</li>)}
  </ul>;
}

export function SlotButton({ slot, courtName, selected, now, blocked, onSelect }) {
  const elapsed = new Date(slot.startAt).getTime() <= now;
  const enabled = selectable(slot, now) && !blocked;
  const label = elapsed ? "Elapsed" : selected ? "Selected" : slot.status === "held" ? "Held" : slot.status === "booked" ? "Booked" : "Available";
  const styles = selected ? "border-ink bg-ink text-paper" : label === "Held" ? "border-dashed border-ink/40 bg-tan" : label === "Booked" || elapsed ? "border-transparent bg-court text-ink/55" : "border-ink/15 bg-paper hover:border-ink hover:bg-tan/60";
  return <button type="button" data-testid={`slot-${slot.id}`} aria-label={`${courtName}, ${formatTime(slot.startAt)} to ${formatTime(slot.endAt)}, ${label}, ${money(slot.amount)}`} aria-pressed={selected} disabled={!enabled} onClick={() => onSelect(slot)} className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-[11px] transition-colors disabled:cursor-not-allowed ${styles}`}>
    <span className="font-medium">{selected && <span aria-hidden="true">✓ </span>}{label}</span>
    {enabled && <span className="text-[10px] opacity-75">{money(slot.amount)}</span>}
  </button>;
}

function PeriodLabel({ position, columns }) {
  const label = position === 0 ? "Morning" : position === 4 ? "Afternoon" : position === 10 ? "Evening" : null;
  return label ? <tr><th colSpan={columns} scope="colgroup" className="bg-ink/5 px-4 py-2 text-left text-[10px] font-medium tracking-widest uppercase">{label}</th></tr> : null;
}

export default function BookingMatrix({ courts, courtId, slots, now, blocked, onSelect }) {
  const selectedIds = new Set(slots.map((slot) => slot.id));
  const selectedCourt = courts.find((court) => court.id === courtId) || courts[0];
  if (!courts.length) return null;
  return <>
    <div className="hidden max-h-[710px] overflow-auto rounded-xl border border-ink/15 md:block">
      <table className="w-full table-fixed border-collapse text-xs">
        <caption className="sr-only">Hourly court availability, 8 AM to midnight. Prices per hour. All times in Asia/Manila.</caption>
        <thead className="sticky top-0 z-10 bg-paper"><tr><th scope="col" className="w-32 border-b border-ink/15 px-3 py-5 text-left">Time</th>{courts.map((court) => <th key={court.id} scope="col" className={`border-b border-ink/15 p-3 text-center font-medium ${court.id === courtId ? "bg-tan/50" : ""}`}>{court.name}<span className="mt-1 block text-[10px] font-normal text-ink/55">{court.kind}</span></th>)}</tr></thead>
        <tbody>{courts[0].slots.map((row, position) => <MatrixRow key={row.id} {...{ row, position, courts, courtId, selectedIds, now, blocked, onSelect }} />)}</tbody>
      </table>
    </div>
    <div className="overflow-hidden rounded-xl border border-ink/15 md:hidden" aria-label={`${selectedCourt.name} hourly availability`}>
      {selectedCourt.slots.map((slot, position) => <div key={slot.id}>
        {[0, 4, 10].includes(position) && <h3 className="bg-ink/5 px-4 py-2 text-[10px] tracking-widest uppercase">{position === 0 ? "Morning" : position === 4 ? "Afternoon" : "Evening"}</h3>}
        <div className="grid grid-cols-[1fr_115px] items-center gap-3 border-t border-ink/10 p-3"><div><p className="text-xs font-medium">{formatTime(slot.startAt)} – {formatTime(slot.endAt)}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-xs">{money(slot.amount)}</span><PriceBadge band={slot.priceBand} /></div>{position === 15 && <p className="mt-1 text-[9px] text-ink/60">Ends next day</p>}</div><SlotButton {...{ slot, selected: selectedIds.has(slot.id), now, blocked, onSelect }} courtName={selectedCourt.name} /></div>
      </div>)}
    </div>
  </>;
}

function MatrixRow({ row, position, courts, courtId, selectedIds, now, blocked, onSelect }) {
  const priceSlot = (courts.find((court) => court.id === courtId) || courts[0]).slots[position];
  return <><PeriodLabel position={position} columns={courts.length + 1} /><tr className="border-t border-ink/10"><th scope="row" className="px-3 py-3 text-left font-normal"><span className="block text-[11px]">{formatTime(row.startAt)}<span className="mx-1">–</span>{formatTime(row.endAt)}</span><span className="my-1.5 block text-xs font-medium">{money(priceSlot.amount)}</span><PriceBadge band={priceSlot.priceBand} />{position === 15 && <span className="mt-1 block text-[9px] text-ink/55">Ends next day</span>}</th>{courts.map((court) => { const slot = court.slots[position]; return <td key={court.id} className="border-l border-ink/10 p-1.5"><SlotButton {...{ slot, selected: selectedIds.has(slot.id), now, blocked, onSelect }} courtName={court.name} /></td>; })}</tr></>;
}
