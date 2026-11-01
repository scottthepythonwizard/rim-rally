"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createHold, getHold, updateHold, releaseHold, expireDemoHold } from "@/services/hold-service";
import { ApiError } from "@/services/api-client";
import { contextKey, holdReducer, holdState, RECOVERY_KEY, remainingMs, validateGuest } from "./hold-state";

const terminal = (error) => ["HOLD_EXPIRED", "NOT_FOUND", "HTTP_404", "HTTP_410"].includes(error.code);
const definitive = (error) => terminal(error) || ["CONFLICT", "INVALID_SELECTION", "REVISION_CONFLICT", "HTTP_409", "HTTP_422", "LOCK_UNSUPPORTED"].includes(error.code);
const blankGuest = { name: "", email: "", mobile: "" };

function readRecovery() {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECOVERY_KEY) || "null");
    if (value && (!value.context || typeof value.credential !== "string" || typeof value.contextKey !== "string")) throw new Error("Invalid recovery record");
    return value;
  } catch { throw new ApiError("STORAGE_ERROR", "This browser could not read your hold recovery information. Enable session storage before continuing."); }
}

export default function useHoldFlow(context, onChanged, initialGuest) {
  const [state, dispatch] = useReducer(holdReducer, holdState);
  const [remaining, setRemaining] = useState(0);
  const [guest, setGuest] = useState(initialGuest || blankGuest);
  const [fieldErrors, setFieldErrors] = useState({});
  const active = useRef(false);
  const busy = useRef(false);
  const acknowledged = useRef(null);
  const recovery = useRef(null);
  const anchor = useRef(null);
  const key = contextKey(context);

  const save = useCallback((record) => {
    try {
      if (record) sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(record));
      else sessionStorage.removeItem(RECOVERY_KEY);
      recovery.current = record;
    } catch { throw new ApiError("STORAGE_ERROR", "The browser could not save hold recovery information. Check your hold before continuing."); }
  }, []);

  const expire = useCallback(() => {
    acknowledged.current = null;
    try { save(null); } catch { /* The UI still expires safely if storage becomes unavailable. */ }
    if (active.current) { dispatch({ type: "EXPIRED" }); setRemaining(0); onChanged(); }
  }, [save, onChanged]);

  const accept = useCallback((hold, record, message = "") => {
    if (contextKey(hold.context) !== record.contextKey) throw new ApiError("INVALID_RESPONSE", "The hold did not match your selected court or date. Check your hold before continuing.");
    if (Date.parse(hold.expiresAt) <= Date.parse(hold.serverNow)) throw new ApiError("HOLD_EXPIRED", "Your hold has expired.");
    if (acknowledged.current?.id === hold.id && Date.parse(hold.expiresAt) > Date.parse(acknowledged.current.expiresAt)) throw new ApiError("INVALID_RESPONSE", "The service changed your hold deadline unexpectedly. Check your hold before continuing.");
    acknowledged.current = hold;
    anchor.current = { serverTime: Date.parse(hold.serverNow), monotonicTime: performance.now() };
    save({ context: hold.context, contextKey: record.contextKey, credential: record.credential, id: hold.id });
    if (active.current) {
      setRemaining(remainingMs(hold.expiresAt, anchor.current, performance.now()));
      dispatch({ type: "ACK", hold, credential: record.credential, message }); onChanged();
    }
    return hold;
  }, [save, onChanged]);

  const execute = useCallback(async (record) => {
    const job = record.job;
    const options = { credential: record.credential, idempotencyKey: job?.idempotencyKey, revision: job?.revision };
    if (job?.type === "release") { await releaseHold(record.id, options); return null; }
    if (job?.type === "create") return createHold(job.input, options);
    if (job?.type === "update") return updateHold(record.id, job.input, options);
    return getHold(record.id, options);
  }, []);

  const recover = useCallback(async (message = "") => {
    if (busy.current) return false;
    busy.current = true;
    if (active.current) dispatch({ type: "REQUEST" });
    try {
      const record = recovery.current || readRecovery();
      recovery.current = record;
      if (!record) { if (active.current) dispatch({ type: "BROWSE" }); return false; }
      if (record.contextKey !== key) {
        // Resolve uncertain creation before leaving its context; never orphan a late successful hold.
        const previous = record.job?.type === "create" ? await execute(record) : { id: record.id };
        if (previous?.id) await releaseHold(previous.id, { credential: record.credential });
        save(null); acknowledged.current = null;
        if (active.current) { dispatch({ type: "BROWSE" }); onChanged(); }
        return false;
      }
      const hold = await execute(record);
      if (!active.current) return false;
      if (!hold) { save(null); acknowledged.current = null; dispatch({ type: "BROWSE", message: "Your temporary hold was cancelled." }); onChanged(); return false; }
      accept(hold, record, message); return hold;
    } catch (error) {
      if (terminal(error)) { expire(); return false; }
      if (definitive(error)) {
        const record = recovery.current;
        if (record?.id) {
          try { const latest = await getHold(record.id, { credential: record.credential }); accept(latest, record, error.message); return latest; }
          catch (checkError) { if (terminal(checkError)) { expire(); return false; } }
        } else { save(null); acknowledged.current = null; if (active.current) dispatch({ type: "BROWSE", message: error.message }); onChanged(); return false; }
      }
      if (active.current) dispatch({ type: "ERROR", uncertain: true, message: error instanceof ApiError ? error.message : "We couldn’t verify your hold. Retry before continuing." });
      return false;
    } finally { busy.current = false; }
  }, [key, execute, accept, save, expire, onChanged]);

  useEffect(() => {
    active.current = true;
    void recover("Your temporary hold was recovered. Re-enter your guest details to continue.");
    const visibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "UNVERIFIED" });
      else void recover();
    };
    const check = () => { if (document.visibilityState === "visible") void recover(); };
    const storage = (event) => { if (event.key === "rim-rally:demo-holds:v1") onChanged(); };
    const interval = setInterval(() => { if (recovery.current && document.visibilityState === "visible") void recover(); }, 30000);
    window.addEventListener("focus", check); window.addEventListener("online", check); window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visibility);
    return () => { active.current = false; clearInterval(interval); window.removeEventListener("focus", check); window.removeEventListener("online", check); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visibility); };
  }, [recover, onChanged]);

  useEffect(() => {
    const tick = setInterval(() => {
      if (!acknowledged.current || !anchor.current) return;
      const milliseconds = remainingMs(acknowledged.current.expiresAt, anchor.current, performance.now());
      setRemaining(milliseconds);
      if (!milliseconds) expire();
    }, 1000);
    return () => clearInterval(tick);
  }, [expire]);

  async function mutate(slots, session) {
    if (busy.current || state.status === "uncertain" || state.status === "recovering") return;
    if (!slots.length && !session) return cancel();
    busy.current = true; dispatch({ type: "REQUEST" });
    let record;
    try {
      const old = acknowledged.current;
      const sameResource = old && old.context.mode === "court" && slots.length && old.slots[0]?.courtId === slots[0].courtId;
      if (old && !sameResource) {
        // Releasing is acknowledged before requesting a different court or Open Play session.
        const releasing = { ...recovery.current, job: { type: "release", idempotencyKey: crypto.randomUUID() } };
        save(releasing); await releaseHold(old.id, { credential: releasing.credential });
        acknowledged.current = null; save(null);
        if (active.current) { dispatch({ type: "BROWSE" }); dispatch({ type: "REQUEST" }); }
      }
      const input = { ...context, ...(session ? { sessionId: session.id } : { slotIds: slots.map((slot) => slot.id) }) };
      const credential = sameResource ? recovery.current.credential : crypto.randomUUID();
      record = { context, contextKey: key, credential, ...(sameResource ? { id: old.id } : {}), job: { type: sameResource ? "update" : "create", input, idempotencyKey: crypto.randomUUID(), ...(sameResource ? { revision: old.revision } : {}) } };
      save(record);
      const hold = await execute(record);
      if (!active.current) {
        // A date/sport change occurred while the acknowledgement was in flight.
        await releaseHold(hold.id, { credential });
        if (sessionStorage.getItem(RECOVERY_KEY) === JSON.stringify(record)) sessionStorage.removeItem(RECOVERY_KEY);
        return;
      }
      accept(hold, record); dispatch({ type: "STEP", step: "selection" });
    } catch (error) {
      if (terminal(error)) expire();
      else if (definitive(error)) {
        if (acknowledged.current && record) save({ ...record, id: acknowledged.current.id, job: undefined });
        else if (!acknowledged.current) save(null);
        if (active.current) dispatch({ type: "ERROR", uncertain: error.code === "REVISION_CONFLICT", message: error.message });
        onChanged();
      } else if (active.current) dispatch({ type: "ERROR", uncertain: true, message: "We couldn’t confirm the hold request. Retry to check that same request; a new hold will not be created." });
    } finally { busy.current = false; }
  }

  async function cancel() {
    if (busy.current) return false;
    if (state.status === "uncertain") { await recover(); return false; }
    if (!acknowledged.current) return true;
    busy.current = true; dispatch({ type: "REQUEST" });
    try {
      const record = { ...recovery.current, job: { type: "release", idempotencyKey: crypto.randomUUID() } };
      save(record); await releaseHold(record.id, { credential: record.credential });
      acknowledged.current = null; save(null); setGuest(blankGuest); setFieldErrors({}); setRemaining(0);
      if (active.current) dispatch({ type: "BROWSE", message: "Your temporary hold was cancelled." });
      onChanged();
      return true;
    } catch (error) {
      if (terminal(error)) expire();
      else if (active.current) dispatch({ type: "ERROR", uncertain: true, message: "Cancellation could not be verified. Retry to finish cancelling your hold." });
      return false;
    } finally { busy.current = false; }
  }

  async function enterDetails() { if (await recover()) dispatch({ type: "STEP", step: "details" }); }
  async function reviewGuest() {
    const errors = validateGuest(guest); setFieldErrors(errors);
    if (Object.keys(errors).length) return false;
    if (await recover()) { dispatch({ type: "STEP", step: "review" }); return true; }
    return false;
  }
  async function expireDemo() {
    if (!acknowledged.current || busy.current) return;
    await expireDemoHold(acknowledged.current.id, { credential: recovery.current.credential }); await recover();
  }

  return { ...state, remaining, guest, setGuest, fieldErrors, setFieldErrors, mutate, cancel, recover, enterDetails, reviewGuest, expireDemo, back: (step) => dispatch({ type: "STEP", step }), busy: ["recovering", "securing", "uncertain"].includes(state.status), canContinue: state.status === "held" && state.verified && remaining > 0 };
}
