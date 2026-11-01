"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSchedule } from "@/services/scheduling-service";
import PaymentStatus from "@/features/checkout/payment-status";
import { PAYMENT_RECOVERY } from "@/services/payment-operations";
import DateNavigation from "./date-navigation";
import BookingMatrix, { SlotLegend } from "./booking-matrix";
import OpenPlay from "./open-play";
import PriceSummary from "./price-summary";
import { addDays, manilaDate, money, normalizeOptions, selectable, toggleSlot, totalAmount } from "./scheduling";
import useHoldFlow from "./use-hold-flow";
import HoldCountdown from "./hold-countdown";
import GuestDetails, { GuestReview } from "./guest-details";

function requestReducer(state, action) {
  if (action.type === "LOADING") return { ...state, status: "loading", error: null };
  if (action.type === "READY") return { status: "ready", data: action.data, error: null };
  if (action.type === "ERROR") return { ...state, status: "error", error: action.error };
  return state;
}

export default function BookingFlow({ facility, serverNow }) {
  const params = useSearchParams();
  const [draftPayment, setDraftPayment] = useState(undefined);
  const [draftGuest, setDraftGuest] = useState(undefined);
  const [checkout, setCheckout] = useState(null);
  const [recoveryReady, setRecoveryReady] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
    if (!active) return;
    try { const record = JSON.parse(sessionStorage.getItem(PAYMENT_RECOVERY) || "null"); if (record?.credential && record?.key && record?.holdId && record?.method && Number.isSafeInteger(record.amount)) setCheckout({ record }); } catch { /* An invalid recovery record cannot authorize a payment. */ }
    setRecoveryReady(true);
    });
    return () => { active = false; };
  }, []);
  const [clock, setClock] = useState(Date.parse(serverNow));
  useEffect(() => {
    const start = performance.now();
    const tick = setInterval(() => setClock(Date.parse(serverNow) + performance.now() - start), 30000);
    return () => clearInterval(tick);
  }, [serverNow]);
  const today = manilaDate(clock);
  const options = normalizeOptions(params, today);
  function change(changes) {
    setDraftGuest(undefined); setDraftPayment(undefined);
    const next = { ...options, ...changes };
    if (changes.sport && changes.sport !== options.sport) next.court = `${changes.sport}-1`;
    const query = new URLSearchParams({ sport: next.sport, date: next.date, mode: next.mode, court: next.court });
    if (next.scenario !== "normal") query.set("scenario", next.scenario);
    window.history.pushState(null, "", `?${query}`);
  }
  const scope = `${options.sport}/${options.date}/${options.mode}/${options.scenario}`;
  if (!recoveryReady) return <p role="status">Checking reservation recovery…</p>;
  if (checkout) return <PaymentStatus {...checkout} onExit={(result) => { if (result?.cancelled) { setDraftGuest(undefined); setDraftPayment(undefined); } setCheckout(null); }} />;
  return <div>
    <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
      <fieldset><legend className="mb-3 text-[10px] tracking-widest uppercase">Choose your sport</legend><div className="flex gap-2">{facility.sports.map((sport) => <button key={sport} type="button" aria-pressed={options.sport === sport} onClick={() => change({ sport })} className={`min-h-11 rounded-full border border-ink px-6 font-editorial text-xs capitalize ${options.sport === sport ? "bg-ink text-paper" : "hover:bg-tan"}`}>{sport}</button>)}</div></fieldset>
      <p className="text-[11px] text-ink/65">8:00 AM–12:00 midnight · Philippine time</p>
    </div>
    <div role="group" aria-label="Booking type" className="mt-7 flex gap-6 border-b border-ink/15 font-editorial text-sm">{[["court", "Court reservation"], ["open-play", "Open Play"]].map(([mode, name]) => <button type="button" key={mode} aria-pressed={options.mode === mode} onClick={() => change({ mode })} className={`min-h-12 border-b-2 py-3 ${mode === options.mode ? "border-ink font-medium" : "border-transparent text-ink/60 hover:text-ink"}`}>{name}</button>)}</div>
    <div className="mt-7"><DateNavigation date={options.date} today={today} onChange={(date) => change({ date })} /></div>
    <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => change({ date: addDays(today, 1) })} className="min-h-11 rounded-full border border-ink/15 px-4 text-xs hover:bg-tan">Tomorrow</button><p className="flex items-center px-1 text-[11px] text-ink/60">Choose a date, then select a court and time.</p></div>
    <ScheduleScope key={scope} {...{ facility, options, change }} initialNow={clock} initialGuest={draftGuest} initialPayment={draftPayment} onCheckout={(record, input) => { setDraftGuest(input.guest); setDraftPayment(input); setCheckout({ record, input }); }} />
    {process.env.NEXT_PUBLIC_API_MODE !== "http" && <details className="mt-10 border-t border-ink/15 pt-5 text-xs"><summary className="min-h-11 cursor-pointer py-3 text-ink/60">Demo availability scenarios</summary><label className="mt-3 flex flex-wrap items-center gap-3">Preview state<select aria-label="Demo scenario" value={options.scenario} onChange={(event) => change({ scenario: event.target.value })} className="min-h-11 rounded-lg border border-ink/20 bg-paper px-4">{[["normal", "Normal availability"], ["sold-out", "Fully booked"], ["empty", "No schedules"], ["error", "Service error"], ["slow", "Slow response"], ["malformed", "Unexpected response"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="mt-3 text-ink/60">Illustrative inventory and prices. These controls affect this preview only.</p></details>}
  </div>;
}

function ScheduleScope({ facility, options, change, initialNow, onCheckout, initialGuest, initialPayment }) {
  const [view, dispatchRequest] = useReducer(requestReducer, { status: "loading", data: null, error: null });
  const [selectionMessage, setSelectionMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(initialNow);
  const anchor = useRef({ epoch: initialNow, monotonic: null });
  const { sport, date, mode, scenario } = options;
  const holdContext = useMemo(() => ({ facilityId: facility.id, sport, date, mode }), [facility.id, sport, date, mode]);
  const refreshAvailability = useCallback(() => setAttempt((value) => value + 1), []);
  const flow = useHoldFlow(holdContext, refreshAvailability, initialGuest);
  const selection = { slots: flow.hold?.slots || [], session: flow.hold?.session || null };

  useEffect(() => {
    let active = true;
    let request;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      dispatchRequest({ type: "LOADING" });
      try {
        const data = await getSchedule({ facilityId: facility.id, sport, date, scenario }, { mode, signal: controller.signal, credential: flow.credential });
        if (!active || controller.signal.aborted) return;
        const epoch = Date.parse(data.serverNow);
        anchor.current = { epoch, monotonic: performance.now() };
        setNow(epoch);
        dispatchRequest({ type: "READY", data });
      } catch (error) {
        if (active && !controller.signal.aborted) dispatchRequest({ type: "ERROR", error });
      }
    }
    void refresh();
    const interval = setInterval(refresh, 30000);
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => { active = false; request?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", focus); window.removeEventListener("focus", focus); window.removeEventListener("online", focus); };
  }, [facility.id, sport, date, mode, scenario, attempt, flow.credential]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (anchor.current.monotonic !== null) setNow(anchor.current.epoch + performance.now() - anchor.current.monotonic);
    }, 15000);
    return () => clearInterval(tick);
  }, []);

  const courts = view.data?.courts || [];
  const courtId = courts.some((court) => court.id === options.court) ? options.court : courts[0]?.id;
  const blocked = view.status !== "ready" || flow.busy || flow.step !== "selection";
  const sessions = view.data?.sessions || [];
  const hasData = mode === "court" ? courts.length > 0 : sessions.length > 0;
  const soldOut = hasData && (mode === "court" ? !courts.some((court) => court.slots.some((slot) => selectable(slot, now))) : !sessions.some((session) => (session.registeredCount + (session.heldCount || 0) < session.capacity || session.heldByYou) && new Date(session.startAt).getTime() > now));

  function selectSlot(slot) {
    if (blocked) return;
    const next = toggleSlot(selection.slots, slot, now);
    if (next.error) { setSelectionMessage(next.error); return; }
    setSelectionMessage("");
    if (slot.courtId !== courtId) change({ court: slot.courtId });
    void flow.mutate(next.slots, null);
  }
  const amount = selection.session ? selection.session.amount : totalAmount(selection.slots);
  const selectedCount = selection.slots.length || (selection.session ? 1 : 0);
  return <>
    <div className="sticky top-0 z-20 mt-5 bg-paper pt-2" aria-label="Hold status">
      {(flow.hold || flow.busy) && <HoldCountdown remaining={flow.remaining} status={flow.status} hasHold={Boolean(flow.hold)} verified={flow.verified} />}
      {flow.message && <p role={/recovered|cancelled/.test(flow.message) ? "status" : "alert"} className="mb-4 rounded-lg border border-ink/25 bg-tan/50 px-4 py-3 text-xs leading-6">{flow.message}</p>}
      {(flow.status === "uncertain" || (flow.hold && !flow.verified && !flow.busy)) && <button type="button" onClick={() => flow.recover()} className="mb-4 min-h-11 rounded-full border border-ink px-5 text-xs">Retry hold check</button>}
    </div>
    <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_290px] xl:grid-cols-[minmax(0,1fr)_310px]">
      {flow.step === "details" ? <GuestDetails flow={flow} /> : flow.step === "review" ? <GuestReview flow={flow} onCheckout={onCheckout} initialPayment={initialPayment} /> :
      <section aria-label={mode === "court" ? "Court schedule" : "Open Play sessions"} className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          {mode === "court" && courts.length > 0 ? <label className="flex items-center gap-3 text-xs">Court<select aria-label="Choose court" value={courtId} disabled={flow.busy} onChange={async (event) => { const value = event.target.value; if (await flow.cancel()) { setSelectionMessage(""); change({ court: value }); } }} className="min-h-11 max-w-full rounded-lg border border-ink/20 bg-paper px-3">{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label> : <p className="font-editorial text-sm">{mode === "open-play" ? "Find your people. Join a session." : "Hourly availability"}</p>}
          <button type="button" disabled={view.status === "loading"} onClick={() => setAttempt((value) => value + 1)} className="min-h-11 text-xs underline underline-offset-4 disabled:opacity-40">Refresh availability</button>
        </div>
        {mode === "court" && <div className="mb-5"><SlotLegend /></div>}
        {selectionMessage && <p role="alert" className="mb-5 rounded-lg border border-ink/25 bg-tan/50 px-4 py-3 text-xs leading-6">{selectionMessage}</p>}
        {view.status === "error" && <div role="alert" className="mb-5 rounded-xl border border-ink/25 bg-tan/40 p-5"><h3 className="font-semibold">We couldn’t load the schedule.</h3><p className="mt-2 text-xs leading-6">{view.error?.message || "Please try again."}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-3 min-h-11 rounded-full bg-ink px-5 text-xs text-paper">Try again</button></div>}
        {view.status === "loading" && !view.data && <ScheduleSkeleton />}
        {view.status === "loading" && view.data && <p role="status" className="mb-3 text-xs">Refreshing availability…</p>}
        {view.status === "ready" && !hasData && <div className="rounded-xl border border-dashed border-ink/25 p-10 text-center"><h3 className="font-editorial text-xl">No schedules for this day.</h3><p className="mt-3 text-sm leading-7">Choose another date or sport to find your next game.</p><button onClick={() => change({ date: addDays(date, 1) })} className="mt-5 min-h-11 rounded-full bg-ink px-5 text-xs text-paper">Try the next day</button></div>}
        {soldOut && <p role="status" className="mb-5 rounded-lg border border-ink/20 bg-court/40 p-4 text-xs leading-6">No available {mode === "court" ? "hours" : "places"} remain for this day. Choose another date or sport.</p>}
        {hasData && (mode === "court" ? <BookingMatrix {...{ courts, courtId, now, blocked }} slots={selection.slots} onSelect={selectSlot} /> : <OpenPlay {...{ sessions, now, blocked }} selection={selection.session} onSelect={(session) => flow.mutate([], selection.session?.id === session.id ? null : session)} />)}
        <p className="mt-4 text-[10px] leading-6 text-ink/60">{mode === "court" ? "Rates are per court, per hour. Select consecutive hours on one court. Midnight ends on the following day." : "One place per guest booking. Player counts refresh with availability."}</p>
      </section>}
      <PriceSummary {...{ date, sport, courts }} slots={selection.slots} session={selection.session} onClear={() => flow.cancel()} stale={view.status === "error"} disabled={flow.busy}>
        {flow.hold && flow.step === "selection" && <button type="button" disabled={!flow.canContinue || flow.busy} onClick={() => flow.enterDetails()} className="mt-5 min-h-11 w-full rounded-full bg-ink px-5 font-editorial text-xs text-paper disabled:opacity-40">Enter guest details</button>}
      </PriceSummary>
    </div>
    {selectedCount > 0 && flow.step === "selection" && <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 border-t border-ink/20 bg-paper px-5 py-3 lg:hidden"><p className="text-xs">{selectedCount} {selection.session ? "place" : selectedCount === 1 ? "hour" : "hours"}<span className="mt-1 block text-[10px] text-ink/60">Temporarily held</span></p><output aria-label="Mobile selection total" className="font-editorial text-xl">{money(amount)}</output><a href="#summary-title" className="rounded-full bg-ink px-5 py-3 text-xs text-paper">Review</a></div>}
    {flow.hold && process.env.NEXT_PUBLIC_API_MODE !== "http" && <details className="mt-5 text-xs text-ink/65"><summary className="min-h-11 py-3">Demo hold controls</summary><button type="button" disabled={flow.busy} onClick={() => flow.expireDemo()} className="min-h-11 rounded-full border border-ink/30 px-5">Expire demo hold</button><p className="mt-3 leading-6">This hold is simulated in this browser. Cross-user locking needs the backend.</p></details>}
  </>;
}

export function ScheduleSkeleton() {
  return <div role="status" aria-label="Loading availability" className="rounded-xl border border-ink/15 p-4"><p className="mb-4 text-xs">Loading availability…</p>{Array.from({ length: 6 }, (_, index) => <div key={index} className="mb-3 grid grid-cols-4 gap-2 motion-safe:animate-pulse"><div className="h-14 rounded bg-tan/50" />{[1, 2, 3].map((item) => <div key={item} className="h-14 rounded bg-court/60" />)}</div>)}</div>;
}
