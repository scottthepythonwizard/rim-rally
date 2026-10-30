"use client";

import { useId, useRef } from "react";
import { DayPicker } from "react-day-picker";
import { addDays, formatDay, manilaDate, TIME_ZONE } from "./scheduling";

export function CalendarIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M7 3v4m10-4v4M3 11h18" stroke="currentColor" strokeWidth="1.5" /></svg>;
}

const iconButton = "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink/20 bg-paper transition-colors hover:bg-tan disabled:cursor-not-allowed disabled:opacity-30";

export default function DateNavigation({ date, today, onChange }) {
  const dialog = useRef(null);
  const titleId = useId();
  return <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink/15 pb-5">
    <div className="flex items-center gap-3"><CalendarIcon /><h2 className="text-lg font-bold sm:text-xl">{formatDay(date)}</h2>{date === today && <span className="rounded-full bg-ink px-3 py-1 text-[10px] text-paper">Today</span>}<span className="sr-only">All times in Asia/Manila</span></div>
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(today)} disabled={date === today} className="mr-1 min-h-11 px-2 text-xs underline underline-offset-4 disabled:opacity-40">Today</button>
      <button type="button" aria-label="Previous day" disabled={date <= today} onClick={() => onChange(addDays(date, -1))} className={iconButton}>‹</button>
      <button type="button" aria-label="Choose date" aria-haspopup="dialog" onClick={() => dialog.current.showModal()} className={iconButton}><CalendarIcon /></button>
      <button type="button" aria-label="Next day" onClick={() => onChange(addDays(date, 1))} className={iconButton}>›</button>
    </div>
    <dialog ref={dialog} aria-labelledby={titleId} onClick={(event) => { if (event.target === dialog.current) dialog.current.close(); }} className="fixed inset-0 z-50 m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-ink/20 bg-paper p-4 text-ink">
      <div className="mb-5 flex items-center justify-between"><h3 id={titleId} className="font-editorial text-lg">Choose your day</h3><button type="button" aria-label="Close calendar" onClick={() => dialog.current.close()} className="h-11 w-11 rounded-full border border-ink/20">×</button></div>
      <DayPicker key={date} mode="single" required timeZone={TIME_ZONE} today={new Date(`${today}T12:00:00+08:00`)} defaultMonth={new Date(`${date}T12:00:00+08:00`)} selected={new Date(`${date}T12:00:00+08:00`)} disabled={{ before: new Date(`${today}T00:00:00+08:00`) }} onSelect={(day) => { if (day) { onChange(manilaDate(day)); dialog.current.close(); } }}
        classNames={{
          root: "relative mx-auto w-fit", months: "relative", month: "space-y-4", month_caption: "flex h-11 items-center px-11", caption_label: "mx-auto text-sm font-semibold", nav: "absolute inset-x-0 top-0 flex justify-between", button_previous: iconButton, button_next: iconButton,
          chevron: "h-4 w-4 fill-current", month_grid: "border-collapse", weekdays: "", weekday: "h-10 w-10 text-[11px] font-normal text-ink/60", day: "h-10 w-10 p-0 text-center text-sm", day_button: "flex h-10 w-10 items-center justify-center rounded-full hover:bg-tan", selected: "[&>button]:bg-ink [&>button]:text-paper", disabled: "opacity-25", today: "font-bold underline underline-offset-4", outside: "text-ink/40",
        }} />
      <p className="mt-5 text-center text-[11px] text-ink/65">Philippine time · Past dates are unavailable</p>
    </dialog>
  </div>;
}
