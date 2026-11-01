import { paymentEngine } from "./payment-engine";
import { ApiError } from "@/services/api-client";
import { mockAvailability, mockOpenPlay } from "./scheduling";
import { toggleSlot } from "@/features/booking/scheduling";

export const HOLD_DURATION = 10 * 60 * 1000;
export const HOLD_STORE = "rim-rally:demo-holds:v1";

/** Browser-only simulation, with injected storage/clock for deterministic tests. No guest PII is stored. */
export function createHoldEngine({ read, write, lock, hash, now = Date.now, random = () => crypto.randomUUID() }) {
  const active = (hold) => !hold.released && (hold.booked || hold.paymentPending || Date.parse(hold.expiresAt) > now());
  const snapshot = (hold) => ({ ...structuredClone(hold), recoveryHash: undefined, operations: undefined, serverNow: new Date(now()).toISOString() });
  const authorize = async (hold, credential) => {
    if (!hold || !credential || hold.recoveryHash !== await hash(credential)) throw new ApiError("NOT_FOUND", "This temporary hold could not be found. Please select your time again.");
  };
  const ensureActive = (hold) => { if (!active(hold)) throw new ApiError("HOLD_EXPIRED", "Your temporary hold has expired. Please select your time again."); };
  const getStore = () => {
    const db = read();
    if (!db || db.version !== 1 || !Array.isArray(db.holds)) throw new ApiError("STORAGE_ERROR", "The demo hold store could not be read. Please try again.", { retryable: true });
    return db;
  };
  const save = (db) => { db.holds = db.holds.filter((item) => item.booked || item.paymentPending || Date.parse(item.expiresAt) > now() - 86400000); write(db); };

  function quote(input, db, ignoreId) {
    const others = db.holds.filter((hold) => hold.id !== ignoreId && active(hold));
    if (input.mode === "court") {
      if (!Array.isArray(input.slotIds) || !input.slotIds.length || new Set(input.slotIds).size !== input.slotIds.length) throw new ApiError("INVALID_SELECTION", "Choose consecutive hours on one court.");
      const source = mockAvailability(input, new Date(now()));
      const all = source.courts.flatMap((court) => court.slots);
      const slots = input.slotIds.map((id) => all.find((slot) => slot.id === id)).filter(Boolean).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
      if (slots.length !== input.slotIds.length || slots.some((slot) => slot.courtId !== slots[0].courtId)) throw new ApiError("INVALID_SELECTION", "Choose consecutive hours on one court.");
      let selection = [];
      for (const slot of slots) {
        const result = toggleSlot(selection, slot, now());
        if (result.error || others.some((hold) => hold.slots.some((taken) => taken.id === slot.id))) throw new ApiError("CONFLICT", "That time was just taken. Your previous hold, if any, is unchanged.");
        selection = result.slots;
      }
      return { slots, session: null, quote: { currency: "PHP", totalAmount: slots.reduce((sum, slot) => sum + slot.amount, 0), items: slots.map((slot) => ({ id: slot.id, amount: slot.amount })) } };
    }
    if (input.mode !== "open-play") throw new ApiError("INVALID_SELECTION", "Choose a valid booking type.");
    const session = mockOpenPlay(input, new Date(now())).sessions.find((item) => item.id === input.sessionId);
    const held = others.filter((hold) => hold.session?.id === session?.id).length;
    if (!session || Date.parse(session.startAt) <= now() || session.registeredCount + held >= session.capacity) throw new ApiError("CONFLICT", "This Open Play session has no remaining places. Please choose another session.");
    return { slots: [], session, quote: { currency: "PHP", totalAmount: session.amount, items: [{ id: session.id, amount: session.amount }] } };
  }

  return {
    ...paymentEngine({ lock, getStore, save, authorize, ensureActive, snapshot, now, random }),
    async create(input, { credential, idempotencyKey }) {
      return lock(async () => {
        const db = getStore();
        const recoveryHash = await hash(credential);
        const replay = db.holds.find((hold) => hold.operations.includes(idempotencyKey));
        if (replay) { await authorize(replay, credential); ensureActive(replay); return snapshot(replay); }
        if (db.holds.some((hold) => hold.recoveryHash === recoveryHash && active(hold))) throw new ApiError("ACTIVE_HOLD", "Recover or cancel your existing hold before starting another.");
        const result = quote(input, db);
        const hold = { id: random(), context: { facilityId: input.facilityId, sport: input.sport, date: input.date, mode: input.mode }, ...result, expiresAt: new Date(now() + HOLD_DURATION).toISOString(), revision: 1, recoveryHash, operations: [idempotencyKey], released: false };
        db.holds.push(hold); save(db); return snapshot(hold);
      });
    },
    async get(id, { credential }) {
      return lock(async () => { const hold = getStore().holds.find((item) => item.id === id); await authorize(hold, credential); ensureActive(hold); return snapshot(hold); });
    },
    async update(id, input, { credential, idempotencyKey, revision }) {
      return lock(async () => {
        const db = getStore(); const hold = db.holds.find((item) => item.id === id);
        await authorize(hold, credential); ensureActive(hold);
        if (hold.paymentPending || hold.booked) throw new ApiError("PAYMENT_PENDING", "This allocation is managed by checkout. Check payment status.");
        if (hold.operations.includes(idempotencyKey)) return snapshot(hold);
        if (hold.revision !== revision) throw new ApiError("REVISION_CONFLICT", "Your hold changed in another tab. Check your hold before continuing.");
        if (hold.context.mode !== "court") throw new ApiError("INVALID_SELECTION", "Choose another session to change your Open Play reservation.");
        const result = quote({ ...hold.context, ...input }, db, id);
        if (result.slots[0].courtId !== hold.slots[0].courtId) throw new ApiError("INVALID_SELECTION", "Cancel this hold before changing courts.");
        Object.assign(hold, result); hold.revision++; hold.operations.push(idempotencyKey); save(db); return snapshot(hold);
      });
    },
    async release(id, { credential }) {
      return lock(async () => { const db = getStore(); const hold = db.holds.find((item) => item.id === id); await authorize(hold, credential); if (hold.paymentPending || hold.booked) throw new ApiError("PAYMENT_PENDING", "Check payment status before releasing this allocation."); hold.released = true; save(db); return { released: true }; });
    },
    async expire(id, { credential }) {
      return lock(async () => { const db = getStore(); const hold = db.holds.find((item) => item.id === id); await authorize(hold, credential); hold.expiresAt = new Date(now() - 1).toISOString(); save(db); return { expired: true }; });
    },
    async overlay(data, credential) {
      const db = getStore(); const ownedHash = credential ? await hash(credential) : null;
      const holds = db.holds.filter(active);
      if (data.courts) return { ...data, courts: data.courts.map((court) => ({ ...court, slots: court.slots.map((slot) => { const holder = holds.find((hold) => hold.slots.some((item) => item.id === slot.id)); return holder ? { ...slot, status: holder.booked ? "booked" : "held", heldByYou: !holder.booked && holder.recoveryHash === ownedHash } : slot; }) })) };
      return { ...data, sessions: data.sessions.map((session) => { const matching = holds.filter((hold) => hold.session?.id === session.id); return { ...session, registeredCount: Math.min(session.capacity, Math.min(session.registeredCount, session.capacity - matching.length) + matching.filter((h) => h.booked).length), heldCount: matching.filter((h) => !h.booked).length, heldByYou: matching.some((hold) => !hold.booked && hold.recoveryHash === ownedHash) }; }) };
    },
  };
}

let browserEngine;
export function getBrowserHoldEngine() {
  if (!browserEngine) browserEngine = createHoldEngine({
    read: () => { try { return JSON.parse(localStorage.getItem(HOLD_STORE) || '{"version":1,"holds":[]}'); } catch { throw new ApiError("STORAGE_ERROR", "Browser storage is unavailable. Holds cannot be secured in this demo."); } },
    write: (db) => { try { localStorage.setItem(HOLD_STORE, JSON.stringify(db)); } catch { throw new ApiError("STORAGE_ERROR", "The hold could not be saved. Please try again."); } },
    lock: (work) => {
      if (!navigator.locks) throw new ApiError("LOCK_UNSUPPORTED", "This browser cannot coordinate demo holds safely. Please use a current browser on localhost or HTTPS.");
      return navigator.locks.request(HOLD_STORE, work);
    },
    hash: async (credential) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(credential)))).map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  });
  return browserEngine;
}
