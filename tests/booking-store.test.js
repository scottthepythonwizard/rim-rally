// @vitest-environment node
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { beforeAll, expect, test } from "vitest";
import { validatePaymentAttempt } from "../src/services/payments/payment-service";
import { db, digest, token } from "../scripts/legacy/staff-store.mjs";
import { changeHold, createPayment, createWalkIn, listBookings, listCustomers, readAvailability, readPayment, readReceipt, requestCancellation, completeCancellation, bookingDetails, saveProof, proofUpload, readProof, reviewProof, sessionGuard, listSessions, recordRefund, receiveCash } from "../scripts/legacy/booking-store";

const secret = token(), credential = token(), guest = { name: "Test Customer", email: "test@example.test", mobile: "09171234567" };
const context = { facilityId: "rim-and-rally", sport: "pickleball", date: "2030-01-01", mode: "court" };
const request = (hour = 8) => ({ ...context, slotIds: [`2030-01-01_pickleball-1_${hour}`] });
beforeAll(() => {
  process.env.STAFF_DB_PATH = join(mkdtempSync(join(tmpdir(), "rr-booking-unit-")), "test.sqlite");
  db().prepare("INSERT INTO accounts VALUES (?,?,?,?,?)").run("test-admin", "admin@example.test", "unused-fixture", "admin", 1);
  db().prepare("INSERT INTO sessions VALUES (?,?,?)").run(digest(secret), "test-admin", Date.now() + 3600000);
});

test("guest payment stays pending until staff verify private proof; cancellation releases court and records refund separately", async () => {
  const holdKey = randomUUID();
  const hold = changeHold("create", null, request(), credential, holdKey);
  expect(changeHold("create", null, request(), credential, holdKey).id).toBe(hold.id);
  expect(() => changeHold("create", null, request(), token(), randomUUID())).toThrow(/taken/);
  expect(() => changeHold("get", hold.id, null, token())).toThrow(/not found/);
  expect(() => createPayment({ holdId: hold.id, holdRevision: 1, expectedAmount: 1, method: "gcash", guest, mobile: guest.mobile }, credential, randomUUID())).toThrow(/Review/);
  const input = { holdId: hold.id, holdRevision: 1, expectedAmount: 40000, method: "gcash", guest, mobile: guest.mobile };
  const key = randomUUID(), payment = createPayment(input, credential, key);
  expect(payment.status).toBe("pending");
  expect(createPayment(input, credential, key).id).toBe(payment.id);
  expect(listBookings(secret)[0].source).toBe("online");
  expect(() => readPayment(payment.id, token())).toThrow(/not found/);
  expect(() => readReceipt(payment.reservationId, credential)).toThrow(/not found/);
  await expect(proofUpload(new File(["fake"], "bad.png", { type: "image/png" }))).rejects.toThrow(/not a supported/);
  const upload = await proofUpload(new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7V8AAAAASUVORK5CYII=", "base64")], "proof.png"));
  expect(() => saveProof(payment.id, upload, token())).toThrow(/not found/);
  const proof = saveProof(payment.id, upload, credential);
  expect(() => readProof(null, proof.id)).toThrow(/permission/);
  expect(readProof(secret, proof.id).mime).toBe("image/png");
  expect(() => reviewProof(secret, proof.id, "rejected", "")).toThrow(/explain/);
  reviewProof(secret, proof.id, "rejected", "Transfer details are unreadable");
  expect(readPayment(payment.id, credential)).toMatchObject({ status: "pending", proofStatus: "rejected" });
  const replacement = saveProof(payment.id, upload, credential);
  reviewProof(secret, replacement.id, "verified", "Matched transfer");
  expect(readPayment(payment.id, credential).bookingStatus).toBe("confirmed");
  expect(readReceipt(payment.reservationId, credential).guestName).toBe(guest.name);
  expect(() => reviewProof(secret, replacement.id, "verified", "")).toThrow(/already/);
  requestCancellation(payment.reservationId, "Cannot attend", credential);
  expect(() => completeCancellation(secret, payment.reservationId, "", "Approved")).toThrow(/refund decision/);
  completeCancellation(secret, payment.reservationId, "pending", "Refund approved, processing externally");
  expect(bookingDetails(secret, payment.reservationId)).toMatchObject({ status: "canceled", payment: { status: "succeeded" }, cancellation: { refund_status: "pending" } });
  expect(validatePaymentAttempt(readPayment(payment.id, credential))).toMatchObject({ status: "succeeded", bookingStatus: "canceled" });
  expect(readAvailability(context).courts[0].slots[0].status).toBe("available");
  recordRefund(secret, payment.reservationId, "External transfer REF-001");
  expect(bookingDetails(secret, payment.reservationId).cancellation.refund_status).toBe("refunded");
});

test("walk-ins reuse customers, validate on server, survive retries, and reject unauthorized staff", () => {
  const input = { ...request(10), method: "cash", guest };
  expect(() => createWalkIn(input, null, randomUUID())).toThrow(/permission/);
  const key = randomUUID(), payment = createWalkIn(input, secret, key);
  expect(createWalkIn(input, secret, key).id).toBe(payment.id);
  expect(() => createWalkIn({ ...input, ...request(11) }, secret, key)).toThrow(/different booking/);
  expect(bookingDetails(secret, payment.reservationId)).toMatchObject({ status: "confirmed", source: "walk-in", payment: { status: "succeeded" } });
  expect(listCustomers(secret)).toHaveLength(1);
  expect(() => createWalkIn(input, secret, randomUUID())).toThrow(/taken/);
  expect(() => listBookings(null)).toThrow(/permission/);
  expect(() => sessionGuard(null, ["Overlap", "pickleball", "Court 1", "2030-01-01T10:00:00+08:00", "2030-01-01T12:00:00+08:00", 10, 20000])).toThrow(/overlaps/);
});

test("staff can record later cash collection for an unpaid walk-in", () => {
  const payment = createWalkIn({ ...request(14), method: "unpaid", guest }, secret, randomUUID());
  expect(() => receiveCash(null, payment.reservationId)).toThrow(/permission/);
  receiveCash(secret, payment.reservationId);
  expect(bookingDetails(secret, payment.reservationId)).toMatchObject({ status: "confirmed", payment: { method: "cash", status: "succeeded" } });
  expect(() => receiveCash(secret, payment.reservationId)).toThrow(/unpaid walk-in/);
});

test("open play capacity, session changes and current/upcoming boundaries use shared allocations", () => {
  db().prepare("INSERT INTO schedules (id,name,sport,court,starts,ends,capacity,amount) VALUES (?,?,?,?,?,?,?,?)").run("test-session", "Test session", "pickleball", "Court 2", "2030-01-01T18:00:00+08:00", "2030-01-01T20:00:00+08:00", 1, 20000);
  const input = { ...context, mode: "open-play", sessionId: "test-session", method: "unpaid", guest };
  const payment = createWalkIn(input, secret, randomUUID());
  expect(() => createWalkIn(input, secret, randomUUID())).toThrow(/available places/);
  expect(readAvailability(context, "open-play").sessions[0]).toMatchObject({ heldCount: 1, registeredCount: 0 });
  expect(() => sessionGuard("test-session", null, true)).toThrow(/Cancel this session/);
  const before = Date.parse("2030-01-01T17:59:59+08:00"), start = Date.parse("2030-01-01T18:00:00+08:00"), end = Date.parse("2030-01-01T20:00:00+08:00");
  expect(listSessions(secret, {}, before).some((s) => s.id === "test-session")).toBe(true);
  expect(listSessions(secret, { timing: "current" }, start)[0].remaining).toBe(0);
  expect(listSessions(secret, { timing: "current" }, end)).toHaveLength(0);
  requestCancellation(payment.reservationId, "Wrong session", null, secret);
  completeCancellation(secret, payment.reservationId, "", "Unpaid booking canceled");
  expect(readAvailability(context, "open-play").sessions[0].heldCount).toBe(0);
  expect(() => sessionGuard("test-session", null, true)).not.toThrow();
});
