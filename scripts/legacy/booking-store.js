import { randomUUID } from "node:crypto";
import { db, digest, sessionAccount, StaffError, transaction } from "./staff-store.mjs";
import { atHour, validDate, manilaDate } from "@/features/booking/scheduling";
import { normalizeMobile, validateGuest } from "@/features/booking/hold-state";

const stamp = () => new Date().toISOString();
const active = (hold) => !hold.released && (hold.booked || hold.paymentPending || Date.parse(hold.expiresAt) > Date.now());
const overlap = (a, b) => Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt);

export function staffActor(secret) {
  const actor = sessionAccount(secret);
  if (!actor) throw new StaffError("You do not have permission for this action.");
  return actor;
}

function fail(message, code = "INVALID_FIELDS") {
  const error = new StaffError(message);
  error.code = code;
  throw error;
}

function ownerKey(credential) {
  if (typeof credential !== "string" || credential.length < 20 || credential.length > 200) fail("Reservation not found.", "NOT_FOUND");
  return digest(credential);
}

function holds() {
  return db().prepare("SELECT payload FROM booking_holds").all().map((row) => JSON.parse(row.payload));
}

function writeHold(hold, owner) {
  db().prepare("INSERT INTO booking_holds VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(hold.id, owner, JSON.stringify(hold));
}

function ownedHold(id, credential, allowInactive = false) {
  const owner = ownerKey(credential);
  const row = db().prepare("SELECT * FROM booking_holds WHERE id=? AND owner=?").get(id, owner);
  if (!row) fail("Reservation not found.", "NOT_FOUND");
  const hold = JSON.parse(row.payload);
  if (!allowInactive && !active(hold)) fail("Your hold has expired. Choose an available time.", "HOLD_EXPIRED");
  return { hold, owner };
}

function context(input) {
  if (input.facilityId !== "rim-and-rally" || !["pickleball", "basketball"].includes(input.sport)
    || !validDate(input.date) || input.date < manilaDate() || !["court", "open-play"].includes(input.mode)) fail("Choose a valid sport, date and booking type.");
  return { facilityId: input.facilityId, sport: input.sport, date: input.date, mode: input.mode };
}

export function courtId(sport, label) {
  const match = /^(?:court|half-court)\s*(\d+)$/i.exec(label.trim());
  return match ? `${sport}-${Number(match[1])}` : `${sport}:${label.trim().toLowerCase()}`;
}

function baseSchedule(query) {
  // Existing facility inventory and confirmed hourly rate, in centavos.
  return { ...query, serverNow: stamp(), courts: Array.from({ length: query.sport === "pickleball" ? 3 : 1 }, (_, i) => {
    const id = `${query.sport}-${i + 1}`;
    return { id, name: query.sport === "pickleball" ? `Court ${i + 1}` : `Half-court ${i + 1}`, kind: "Indoor",
      slots: Array.from({ length: 16 }, (_, j) => ({ id: `${query.date}_${id}_${j + 8}`, courtId: id, startAt: atHour(query.date, j + 8), endAt: atHour(query.date, j + 9), status: "available", priceBand: j + 8 >= 17 && j + 8 < 22 ? "peak" : "off-peak", amount: 40000 })) };
  }) };
}

function openSessions(query) {
  return db().prepare("SELECT * FROM schedules WHERE sport=? AND status='active' AND substr(starts,1,10)=? ORDER BY starts,id")
    .all(query.sport, query.date).map((s) => ({
      id: s.id, name: s.name, courtId: courtId(s.sport, s.court), courtName: s.court,
      startAt: s.starts, endAt: s.ends, capacity: s.capacity, amount: s.amount,
      priceBand: Number(s.starts.slice(11, 13)) >= 17 ? "peak" : "off-peak", registeredCount: 0,
    }));
}

export function readAvailability(query, mode = "court", credential) {
  context({ ...query, mode });
  const owner = credential ? ownerKey(credential) : null;
  const live = db().prepare("SELECT owner,payload FROM booking_holds").all()
    .map((r) => ({ owner: r.owner, ...JSON.parse(r.payload) })).filter(active);
  if (mode === "open-play") {
    const sessions = openSessions(query).map((s) => {
      const claims = live.filter((h) => h.session?.id === s.id);
      return { ...s, registeredCount: claims.filter((h) => h.booked).length,
        heldCount: claims.filter((h) => !h.booked).length, heldByYou: claims.some((h) => !h.booked && h.owner === owner) };
    });
    return { facilityId: query.facilityId, sport: query.sport, date: query.date, serverNow: stamp(), sessions };
  }
  const data = baseSchedule(query);
  const sessions = openSessions(query);
  for (const court of data.courts) for (const slot of court.slots) {
    const claim = live.find((h) => h.slots.some((s) => s.courtId === court.id && overlap(s, slot)));
    if (claim) { slot.status = claim.booked ? "booked" : "held"; slot.heldByYou = !claim.booked && claim.owner === owner; }
    else if (sessions.some((s) => s.courtId === court.id && overlap(s, slot))) slot.status = "booked";
  }
  return data;
}

function selection(input, ignoreId) {
  const ctx = context(input);
  const others = holds().filter((h) => h.id !== ignoreId && active(h));
  if (ctx.mode === "open-play") {
    const session = openSessions(ctx).find((s) => s.id === input.sessionId);
    if (!session || Date.parse(session.startAt) <= Date.now()
      || others.filter((h) => h.session?.id === session.id).length >= session.capacity
      || others.some((h) => h.slots.some((s) => s.courtId === session.courtId && overlap(s, session)))) fail("This session has no available places.", "CONFLICT");
    return { context: ctx, slots: [], session, quote: { currency: "PHP", totalAmount: session.amount, items: [{ id: session.id, amount: session.amount }] } };
  }
  if (!Array.isArray(input.slotIds) || input.slotIds.length < 1 || input.slotIds.length > 16 || new Set(input.slotIds).size !== input.slotIds.length) fail("Choose consecutive hours on one court.");
  const source = baseSchedule(ctx);
  const slots = source.courts.flatMap((c) => c.slots).filter((s) => input.slotIds.includes(s.id)).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
  if (slots.length !== input.slotIds.length || slots.some((s, i) => s.courtId !== slots[0].courtId || Date.parse(s.startAt) <= Date.now()
    || (i > 0 && slots[i - 1].endAt !== s.startAt))) fail("Choose future consecutive hours on one court.");
  const sessions = openSessions(ctx);
  if (slots.some((s) => sessions.some((p) => p.courtId === s.courtId && overlap(s, p))
    || others.some((h) => h.slots.some((p) => p.courtId === s.courtId && overlap(s, p))))) fail("That court time has just been taken.", "CONFLICT");
  return { context: ctx, slots, session: null, quote: { currency: "PHP", totalAmount: slots.reduce((sum, s) => sum + s.amount, 0), items: slots.map((s) => ({ id: s.id, amount: s.amount })) } };
}

export function changeHold(operation, id, input, credential, key) {
  return transaction(() => {
    const owner = ownerKey(credential);
    const fingerprint = digest(JSON.stringify({ operation, id, input }));
    if (["create", "update"].includes(operation)) {
      if (typeof key !== "string" || key.length < 16 || key.length > 200) fail("A request identifier is required.");
      const prior = db().prepare("SELECT * FROM booking_requests WHERE owner=? AND key=?").get(owner, key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) fail("This request identifier was already used for another change.", "CONFLICT");
        return { ...ownedHold(prior.hold_id, credential).hold, serverNow: stamp() };
      }
    }
    let hold;
    if (operation === "create") {
      if (db().prepare("SELECT payload FROM booking_holds WHERE owner=?").all(owner).some((r) => active(JSON.parse(r.payload)))) fail("Recover your existing reservation first.", "CONFLICT");
      hold = { id: randomUUID(), ...selection(input), revision: 1, expiresAt: new Date(Date.now() + 600000).toISOString(), released: false };
    } else {
      hold = ownedHold(id, credential, operation === "release").hold;
      if (operation === "get") return { ...hold, serverNow: stamp() };
      if (hold.paymentPending || hold.booked) fail("This reservation is managed by checkout. Contact staff to cancel it.", "PAYMENT_PENDING");
      if (operation === "release") { hold.released = true; writeHold(hold, owner); return { released: true }; }
      if (operation !== "update" || hold.context.mode !== "court" || input.revision !== hold.revision) fail("Your reservation changed. Check it before editing.", "REVISION_CONFLICT");
      const next = selection(input, id);
      if (JSON.stringify(next.context) !== JSON.stringify(hold.context) || next.slots[0].courtId !== hold.slots[0].courtId) fail("Cancel the existing hold before changing its court or date.");
      hold = { ...hold, ...next, revision: hold.revision + 1 };
    }
    writeHold(hold, owner);
    db().prepare("INSERT INTO booking_requests VALUES (?,?,?,?)").run(owner, key, fingerprint, hold.id);
    return { ...hold, serverNow: stamp() };
  });
}

function customer(input) {
  if (!input || typeof input.name !== "string" || typeof input.email !== "string" || typeof input.mobile !== "string") fail("Enter the customer's name, email and mobile number.");
  if (Object.keys(validateGuest(input)).length || input.name.trim().length > 120 || input.email.length > 254 || input.mobile.length > 24) fail("Enter a valid name, email and Philippine mobile number.");
  const email = input.email.trim().toLowerCase();
  const mobile = normalizeMobile(input.mobile);
  const existing = db().prepare("SELECT id FROM customers WHERE email=? AND mobile=?").get(email, mobile);
  if (existing) return existing.id;
  const id = randomUUID();
  db().prepare("INSERT INTO customers VALUES (?,?,?,?)").run(id, input.name.trim(), email, mobile);
  return id;
}

function paymentResult(payment) {
  const booking = db().prepare("SELECT * FROM bookings WHERE id=?").get(payment.booking_id);
  const verified = payment.status === "succeeded" && booking.status === "confirmed";
  return { id: payment.id, reservationId: booking.id, holdId: booking.hold_id, method: payment.method, amount: booking.amount, currency: "PHP",
    status: payment.status, bookingStatus: booking.status === "canceled" ? "canceled" : verified ? "confirmed" : "none", ...(verified ? { bookingId: booking.id } : {}), serverNow: stamp(),
    proofStatus: db().prepare("SELECT status FROM payment_proofs WHERE payment_id=? ORDER BY submitted DESC,rowid DESC LIMIT 1").get(payment.id)?.status || "not_submitted",
    reviewReason: payment.reason };
}

export function createPayment(input, credential, key, actor = null) {
  return transaction(() => savePayment(input, credential, key, actor));
}

function savePayment(input, credential, key, actor) {
    const owner = ownerKey(credential);
    if (typeof key !== "string" || key.length < 16 || key.length > 200) fail("A payment request identifier is required.");
    const previous = db().prepare("SELECT * FROM booking_payments WHERE owner=? AND key=?").get(owner, key);
    if (previous) {
      const result = paymentResult(previous);
      if (result.holdId !== input.holdId || result.method !== input.method || result.amount !== input.expectedAmount) fail("The payment request changed.", "CONFLICT");
      return result;
    }
    const { hold } = ownedHold(input.holdId, credential);
    if (hold.paymentPending || hold.booked || input.holdRevision !== hold.revision || input.expectedAmount !== hold.quote.totalAmount) fail("Review the current reservation before paying.");
    const methods = actor ? ["cash", "gcash", "maya", "qrph", "unpaid"] : ["gcash", "maya", "qrph"];
    if (!methods.includes(input.method) || hold.quote.totalAmount <= 0) fail("Choose a valid payment method and positive price.");
    if (!actor && input.method !== "qrph" && (typeof input.mobile !== "string" || !normalizeMobile(input.mobile))) fail("Enter a valid wallet mobile number.");
    const customerId = customer(input.guest);
    const id = randomUUID();
    const period = hold.session || { startAt: hold.slots[0].startAt, endAt: hold.slots.at(-1).endAt };
    const court = hold.session?.courtName || (hold.context.sport === "basketball" ? "Half-court 1" : `Court ${hold.slots[0].courtId.split("-").at(-1)}`);
    const paid = actor && input.method === "cash";
    db().prepare("INSERT INTO bookings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(id, hold.id, customerId, hold.context.mode, court,
      hold.session?.id || null, period.startAt, period.endAt, hold.quote.totalAmount, paid ? "confirmed" : "reserved", actor ? "walk-in" : "online", stamp(), randomUUID(), actor?.id || null);
    const paymentId = randomUUID();
    db().prepare("INSERT INTO booking_payments (id,booking_id,method,status,key,owner,reviewed_by,reviewed) VALUES (?,?,?,?,?,?,?,?)")
      .run(paymentId, id, input.method, paid ? "succeeded" : "pending", key, owner, paid ? actor.id : null, paid ? stamp() : null);
    hold.paymentPending = !paid; hold.booked = Boolean(paid);
    writeHold(hold, owner);
    audit(id, actor?.id, paid ? "cash_received" : "booking_created", "");
    return paymentResult(db().prepare("SELECT * FROM booking_payments WHERE id=?").get(paymentId));
}

export function readPayment(id, credential) {
  const payment = db().prepare("SELECT * FROM booking_payments WHERE (id=? OR key=?) AND owner=?").get(id, id, ownerKey(credential));
  if (!payment) fail("Payment not found.", "NOT_FOUND");
  return paymentResult(payment);
}

export function readReceipt(id, credential) {
  const booking = db().prepare("SELECT b.*,c.name AS guestName,p.method,p.owner FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN booking_payments p ON p.booking_id=b.id WHERE b.id=?").get(id);
  if (!booking || booking.owner !== ownerKey(credential) || booking.status !== "confirmed") fail("Booking not found.", "NOT_FOUND");
  const { hold } = ownedHold(booking.hold_id, credential);
  return { id, holdId: hold.id, status: "confirmed", reference: `RR-${id.slice(0, 8).toUpperCase()}`, guestName: booking.guestName,
    facilityName: "Rim & Rally Sports Hub", courtName: booking.court, context: hold.context, slots: hold.slots, session: hold.session,
    amount: booking.amount, currency: "PHP", method: booking.method, ticketToken: booking.ticket };
}

function audit(bookingId, actorId, action, note) {
  db().prepare("INSERT INTO booking_audit VALUES (?,?,?,?,?,?)").run(randomUUID(), bookingId, actorId || null, action, stamp(), note);
}

export function createWalkIn(input, secret, key) {
  const actor = staffActor(secret);
  // The enclosing transaction rolls back both allocation and payment if either fails.
  return transaction(() => {
    staffActor(secret);
    const owner = `walk-in:${actor.id}:${key}`;
    const previous = db().prepare("SELECT p.* FROM booking_payments p WHERE owner=? AND key=?").get(ownerKey(owner), key);
    if (previous) {
      const prior = db().prepare("SELECT payload FROM booking_holds WHERE id=(SELECT hold_id FROM bookings WHERE id=?)").get(previous.booking_id);
      const selected = JSON.parse(prior.payload);
      const sameSlots = [...(input.slotIds || [])].sort().join("|") === selected.slots.map((s) => s.id).sort().join("|");
      const c = db().prepare("SELECT c.* FROM customers c JOIN bookings b ON b.customer_id=c.id WHERE b.id=?").get(previous.booking_id);
      if (JSON.stringify(context(input)) !== JSON.stringify(selected.context) || !sameSlots || (input.sessionId || null) !== (selected.session?.id || null)
        || input.method !== previous.method || input.guest?.email?.trim().toLowerCase() !== c.email || normalizeMobile(input.guest?.mobile || "") !== c.mobile) fail("This request identifier was already used for a different booking.", "CONFLICT");
      return paymentResult(previous);
    }
    const hold = { id: randomUUID(), ...selection(input), revision: 1, expiresAt: new Date(Date.now() + 600000).toISOString(), released: false };
    writeHold(hold, ownerKey(owner));
    return savePayment({ ...input, holdId: hold.id, holdRevision: 1, expectedAmount: hold.quote.totalAmount }, owner, key, actor);
  });
}

export function listBookings(secret, filters = {}) {
  staffActor(secret);
  const conditions = [], values = [];
  if (filters.q) {
    conditions.push("(c.name LIKE ? OR c.email LIKE ? OR b.id LIKE ?)");
    const term = `%${String(filters.q).slice(0, 120)}%`;
    values.push(term, term, term);
  }
  if (validDate(filters.date)) { conditions.push("substr(b.starts,1,10)=?"); values.push(filters.date); }
  if (["court", "open-play"].includes(filters.type)) { conditions.push("b.type=?"); values.push(filters.type); }
  if (["reserved", "confirmed", "canceled"].includes(filters.status)) { conditions.push("b.status=?"); values.push(filters.status); }
  if (filters.customerId) { conditions.push("b.customer_id=?"); values.push(filters.customerId); }
  if (filters.sessionId) { conditions.push("b.session_id=?"); values.push(filters.sessionId); }
  if (["pending", "succeeded", "cancelled"].includes(filters.payment)) { conditions.push("p.status=?"); values.push(filters.payment); }
  const page = Math.max(1, Math.min(100000, Number.parseInt(filters.page, 10) || 1));
  return db().prepare(`SELECT b.*,c.name,c.email,c.mobile,p.status AS payment_status,p.method,
    (SELECT json_extract(payload,'$.session.name') FROM booking_holds WHERE id=b.hold_id) AS session_name,
    (SELECT status FROM payment_proofs WHERE payment_id=p.id ORDER BY submitted DESC,rowid DESC LIMIT 1) AS proof_status
    FROM bookings b JOIN customers c ON c.id=b.customer_id JOIN booking_payments p ON p.booking_id=b.id
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY b.created DESC,b.id LIMIT 51 OFFSET ?`).all(...values, (page - 1) * 50);
}

export function bookingDetails(secret, id) {
  staffActor(secret);
  const booking = db().prepare("SELECT b.*,c.name,c.email,c.mobile FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=?").get(id);
  if (!booking) return null;
  const hold = JSON.parse(db().prepare("SELECT payload FROM booking_holds WHERE id=?").get(booking.hold_id).payload);
  return { ...booking, session_name: hold.session?.name, sessionAvailable: Boolean(booking.session_id && db().prepare("SELECT 1 FROM schedules WHERE id=?").get(booking.session_id)), payment: db().prepare("SELECT id,method,status,reason,reviewed FROM booking_payments WHERE booking_id=?").get(id),
    proofs: db().prepare("SELECT id,name,mime,submitted,status,reason FROM payment_proofs WHERE payment_id=(SELECT id FROM booking_payments WHERE booking_id=?) ORDER BY submitted DESC,rowid DESC").all(id),
    cancellation: db().prepare("SELECT * FROM booking_cancellations WHERE booking_id=?").get(id),
    history: db().prepare("SELECT a.action,a.at,a.note,u.email AS actor FROM booking_audit a LEFT JOIN accounts u ON u.id=a.actor_id WHERE a.booking_id=? ORDER BY a.at,a.rowid").all(id) };
}

export function listCustomers(secret, search = "") {
  staffActor(secret);
  const term = `%${String(search).slice(0, 120)}%`;
  return db().prepare("SELECT c.*, count(b.id) AS bookings FROM customers c LEFT JOIN bookings b ON b.customer_id=c.id WHERE c.name LIKE ? OR c.email LIKE ? OR c.mobile LIKE ? GROUP BY c.id ORDER BY c.name LIMIT 100").all(term, term, term);
}

export function readCustomer(secret, id) {
  staffActor(secret);
  return db().prepare("SELECT * FROM customers WHERE id=?").get(id);
}

export function requestCancellation(id, reason, credential, secret) {
  return transaction(() => {
    const actor = secret ? staffActor(secret) : null;
    const booking = db().prepare("SELECT * FROM bookings WHERE id=?").get(id);
    if (!booking) fail("Booking not found.", "NOT_FOUND");
    if (!actor) ownedHold(booking.hold_id, credential, true);
    if (booking.status === "canceled") fail("This booking is already canceled.");
    if (typeof reason !== "string" || !reason.trim() || reason.length > 1000) fail("Enter a cancellation reason of up to 1,000 characters.");
    const existing = db().prepare("SELECT id FROM booking_cancellations WHERE booking_id=?").get(id);
    if (existing) return existing;
    const cancellationId = randomUUID();
    db().prepare("INSERT INTO booking_cancellations (id,booking_id,reason,requested) VALUES (?,?,?,?)").run(cancellationId, id, reason.trim(), stamp());
    audit(id, actor?.id, "cancellation_requested", reason.trim());
    return { id: cancellationId };
  });
}

export function listCancellations(secret) {
  staffActor(secret);
  return db().prepare("SELECT x.*,b.court,b.starts,c.name FROM booking_cancellations x JOIN bookings b ON b.id=x.booking_id JOIN customers c ON c.id=b.customer_id ORDER BY (x.status='requested') DESC,x.requested DESC LIMIT 100").all();
}

export function completeCancellation(secret, bookingId, refund, decision) {
  return transaction(() => {
    const actor = staffActor(secret);
    const booking = bookingDetails(secret, bookingId);
    if (!booking?.cancellation) fail("Request a cancellation first.");
    if (booking.cancellation.status === "completed") return;
    const paid = booking.payment.status === "succeeded";
    if (typeof decision !== "string" || !decision.trim() || decision.length > 1000) fail("Record the cancellation decision, up to 1,000 characters.");
    if (paid && !["pending", "refunded", "not_due"].includes(refund)) fail("Record a refund decision for this paid booking.");
    const holdRow = db().prepare("SELECT * FROM booking_holds WHERE id=?").get(booking.hold_id);
    const hold = JSON.parse(holdRow.payload);
    hold.released = true; hold.paymentPending = false; hold.booked = false;
    writeHold(hold, holdRow.owner);
    db().prepare("UPDATE bookings SET status='canceled' WHERE id=?").run(bookingId);
    db().prepare("UPDATE booking_payments SET status='cancelled' WHERE booking_id=? AND status!='succeeded'").run(bookingId);
    db().prepare("UPDATE booking_cancellations SET status='completed',refund_status=?,decision=?,processed_by=?,processed=? WHERE booking_id=?")
      .run(paid ? refund : "not_required", decision.trim(), actor.id, stamp(), bookingId);
    audit(bookingId, actor.id, "cancellation_completed", `${paid ? refund : "not_required"} · ${decision.trim()}`);
  });
}

export async function proofUpload(file) {
  if (!file || typeof file.arrayBuffer !== "function" || file.size < 1 || file.size > 5 * 1024 * 1024) fail("Upload a JPEG, PNG, WebP or PDF up to 5 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  const pdf = bytes.toString("ascii", 0, 5) === "%PDF-";
  const mime = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : pdf ? "application/pdf" : null;
  if (!mime || bytes.length !== file.size) fail("The uploaded file is not a supported image or PDF.");
  return { bytes, mime, name: String(file.name || "Payment proof").replace(/[\r\n"\\/]/g, "_").slice(0, 180) };
}

export function saveProof(paymentId, file, credential, secret) {
  return transaction(() => {
    const actor = secret ? staffActor(secret) : null;
    const payment = db().prepare("SELECT * FROM booking_payments WHERE id=?").get(paymentId);
    if (!payment || (!actor && payment.owner !== ownerKey(credential))) fail("Payment not found.", "NOT_FOUND");
    const booking = db().prepare("SELECT status FROM bookings WHERE id=?").get(payment.booking_id);
    if (booking.status === "canceled" || payment.status === "succeeded") fail("This payment is already closed.");
    if (db().prepare("SELECT 1 FROM payment_proofs WHERE payment_id=? AND status='submitted'").get(paymentId)) fail("A proof is already awaiting review.");
    const id = randomUUID();
    db().prepare("INSERT INTO payment_proofs (id,payment_id,name,mime,content,submitted) VALUES (?,?,?,?,?,?)").run(id, paymentId, file.name, file.mime, file.bytes, stamp());
    db().prepare("UPDATE booking_payments SET reason='' WHERE id=?").run(paymentId);
    audit(payment.booking_id, actor?.id, "proof_submitted", "");
    return { id };
  });
}

export function readProof(secret, id) {
  staffActor(secret);
  return db().prepare("SELECT name,mime,content FROM payment_proofs WHERE id=?").get(id);
}

export function reviewProof(secret, id, outcome, reason) {
  return transaction(() => {
    const actor = staffActor(secret);
    const proof = db().prepare("SELECT * FROM payment_proofs WHERE id=?").get(id);
    if (!proof) fail("Proof not found.");
    const payment = db().prepare("SELECT * FROM booking_payments WHERE id=?").get(proof.payment_id);
    const booking = db().prepare("SELECT * FROM bookings WHERE id=?").get(payment.booking_id);
    if (proof.status !== "submitted" || booking.status === "canceled" || payment.status !== "pending") fail("This proof has already been reviewed or the booking is closed.");
    if (!["verified", "rejected"].includes(outcome) || typeof reason !== "string" || reason.length > 1000 || (outcome === "rejected" && !reason.trim())) fail("Choose an outcome and explain a rejected proof.");
    db().prepare("UPDATE payment_proofs SET status=?,reason=?,reviewed_by=?,reviewed=? WHERE id=?").run(outcome, reason.trim(), actor.id, stamp(), id);
    db().prepare("UPDATE booking_payments SET status=?,reason=?,reviewed_by=?,reviewed=? WHERE id=?").run(outcome === "verified" ? "succeeded" : "pending", reason.trim(), actor.id, stamp(), payment.id);
    if (outcome === "verified") {
      db().prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(booking.id);
      const row = db().prepare("SELECT * FROM booking_holds WHERE id=?").get(booking.hold_id);
      const hold = JSON.parse(row.payload);
      hold.booked = true; hold.paymentPending = false;
      writeHold(hold, row.owner);
    }
    audit(booking.id, actor.id, `proof_${outcome}`, reason.trim());
  });
}

export function sessionGuard(id, fields, deleting = false) {
  const live = holds().filter(active);
  const taken = live.filter((h) => h.session?.id === id);
  if (taken.length && deleting) fail("Cancel this session's bookings and active reservations before canceling or deleting the session.");
  if (!fields) return;
  const [name, sport, court, starts, ends, capacity, amount] = fields;
  const current = id ? db().prepare("SELECT * FROM schedules WHERE id=?").get(id) : null;
  if (taken.length && (current.sport !== sport || current.court !== court || current.starts !== starts || current.ends !== ends || current.amount !== amount || capacity < taken.length)) fail("This session has reservations. Keep its court, times and price, and retain enough capacity.");
  const period = { startAt: starts, endAt: ends, courtId: courtId(sport, court) };
  if (live.some((h) => h.slots.some((s) => s.courtId === period.courtId && overlap(s, period)))) fail("A court booking or hold overlaps this session.");
  const existing = db().prepare("SELECT * FROM schedules WHERE status='active' AND id!=?").all(id || "");
  if (existing.some((s) => courtId(s.sport, s.court) === period.courtId && overlap({ startAt: s.starts, endAt: s.ends }, period))) fail("Another session overlaps this court and time.");
  if (!name || amount <= 0) fail("Published sessions need a positive price.");
}

export function recordRefund(secret, id, note) {
  return transaction(() => {
    const actor = staffActor(secret);
    if (typeof note !== "string" || !note.trim() || note.length > 1000) fail("Record the refund reference or explanation.");
    const result = db().prepare("UPDATE booking_cancellations SET refund_status='refunded',decision=?,processed_by=?,processed=? WHERE booking_id=? AND status='completed' AND refund_status='pending'")
      .run(note.trim(), actor.id, stamp(), id);
    if (!result.changes) fail("There is no pending refund on this cancellation.");
    audit(id, actor.id, "refund_recorded", note.trim());
  });
}

export function receiveCash(secret, id) {
  return transaction(() => {
    const actor = staffActor(secret);
    const b = bookingDetails(secret, id);
    if (!b || b.source !== "walk-in" || b.status !== "reserved" || b.payment.status !== "pending") fail("Choose an unpaid walk-in booking that is still reserved.");
    db().prepare("UPDATE booking_payments SET method='cash',status='succeeded',reviewed_by=?,reviewed=?,reason='' WHERE booking_id=?").run(actor.id, stamp(), id);
    db().prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(id);
    db().prepare("UPDATE payment_proofs SET status='rejected',reason='Cash received instead; proof review closed.',reviewed_by=?,reviewed=? WHERE payment_id=? AND status='submitted'").run(actor.id, stamp(), b.payment.id);
    const row = db().prepare("SELECT * FROM booking_holds WHERE id=?").get(b.hold_id);
    const hold = JSON.parse(row.payload);
    hold.booked = true; hold.paymentPending = false;
    writeHold(hold, row.owner);
    audit(id, actor.id, "cash_received", "Cash received at the facility");
  });
}

export function listSessions(secret, filters = {}, now = Date.now()) {
  staffActor(secret);
  const live = holds().filter(active);
  const sessions = db().prepare("SELECT * FROM schedules WHERE status='active'").all().map((s) => {
    const claims = live.filter((h) => h.session?.id === s.id);
    return { ...s, type: "open-play", registered: claims.filter((h) => h.booked).length, held: claims.filter((h) => !h.booked).length,
      remaining: Math.max(0, s.capacity - claims.length), href: `/dashboard/sessions/${s.id}` };
  });
  const courts = db().prepare("SELECT b.*,c.name FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.type='court' AND b.status!='canceled'").all()
    .map((b) => ({ ...b, name: `${b.court} · ${b.name}`, registered: 1, href: `/dashboard/bookings/${b.id}` }));
  return [...sessions, ...courts].filter((s) => (!validDate(filters.date) || s.starts.slice(0, 10) === filters.date)
    && (filters.timing === "current" ? Date.parse(s.starts) <= now && Date.parse(s.ends) > now : Date.parse(s.starts) > now))
    .sort((a, b) => Date.parse(a.starts) - Date.parse(b.starts));
}
