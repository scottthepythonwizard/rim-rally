export default function HoldCountdown({ remaining, status, hasHold, verified }) {
  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const minutes = Math.floor(seconds / 60);
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const announcement = !hasHold ? "" : seconds <= 0 ? "Hold expired." : seconds <= 60 ? "Less than one minute remains on your hold." : seconds <= 120 ? "Less than two minutes remain on your hold." : "Your selection is held for you. Complete your guest details before the timer expires.";
  return <div className="mb-5 rounded-xl border border-ink/25 bg-tan/50 p-4">
    <div className="flex items-center justify-between gap-4"><p className="text-xs font-semibold">{status === "securing" ? hasHold ? "Checking your hold…" : "Securing your time…" : status === "recovering" ? "Checking for an existing hold…" : !verified ? "Hold needs verification" : "Held for you"}</p>{hasHold && <span role="timer" aria-label="Time remaining on hold" aria-live="off" className="font-editorial text-2xl tabular-nums">{formatted}</span>}</div>
    <p className="mt-2 text-[11px] leading-6 text-ink/70">{hasHold ? "Changing hours keeps the same deadline. This is a temporary hold, not a confirmed booking." : "The countdown starts after the service confirms your hold."}</p>
    <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
  </div>;
}
