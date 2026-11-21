"""Shared booking rules using the existing payments models and court row locks."""
import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, time
from zoneinfo import ZoneInfo
from django.contrib.auth import get_user_model
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
from django.db.models import Q
from django.utils import timezone
from django.core import signing
from payments import services as payment_services
from payments.models import Booking, Court, PlaySession, PaymentDestination, Receipt, Review
from .models import (Audit, BookingRecord, Cancellation, CourtIdentity, CustomerProfile,
                     Hold, HoldRequest, Proof, ScheduleIdentity, StaffIdentity)

MANILA = ZoneInfo("Asia/Manila")
CLOSED = {"cancelled", "expired", "rejected"}


class ApiError(Exception):
    def __init__(self, message, code="INVALID_FIELDS", status=422):
        self.message, self.code, self.status = message, code, status


def fail(message, code="INVALID_FIELDS", status=422):
    raise ApiError(message, code, status)


def iso(value):
    return value.astimezone(MANILA).isoformat() if value else None


def parse(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def uid():
    return str(uuid.uuid4())


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def text(value, title, limit, required=True):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        fail(f"Enter {title}, up to {limit:,} characters.")
    return value.strip()


def email(value):
    value = text(value, "a valid email address", 254).lower()
    try:
        validate_email(value)
    except ValidationError:
        fail("Enter a valid email address.")
    return value


def mobile(value):
    value = re.sub(r"[\s()-]", "", text(value, "a Philippine mobile number", 24))
    if re.fullmatch(r"09\d{9}", value):
        return "+63" + value[1:]
    if not re.fullmatch(r"\+639\d{9}", value):
        fail("Use a Philippine mobile number, such as 09171234567.")
    return value


def owner(credential):
    if not isinstance(credential, str) or not 20 <= len(credential) <= 200:
        fail("Reservation not found.", "NOT_FOUND", 404)
    return digest(credential)


def request_key(value):
    return text(value, "a request identifier", 200) if isinstance(value, str) and len(value) >= 16 else fail("A request identifier is required.")


def lock_courts():
    # All allocation writers, including payments.services.reserve(), lock Court.
    # Ordered locks cover court changes too; SQLite dev uses BEGIN IMMEDIATE.
    return list(Court.objects.select_for_update().order_by("pk"))


def court_id(court):
    identity = CourtIdentity.objects.filter(court=court).first()
    return identity.pk if identity else f"court-{court.pk}"


def session_id(session):
    identity = ScheduleIdentity.objects.filter(session=session).first()
    return identity.pk if identity else str(session.pk)


def find_session(value):
    identity = ScheduleIdentity.objects.filter(pk=str(value)).select_related("session__court").first()
    if identity:
        return identity.session
    return PlaySession.objects.filter(pk=int(value)).select_related("court").first() if str(value).isdigit() else None


def context(data):
    if not isinstance(data, dict) or data.get("facilityId") != "rim-and-rally" or data.get("sport") not in {"pickleball", "basketball"} or data.get("mode") not in {"court", "open-play"}:
        fail("Choose a valid facility, sport and booking type.")
    try:
        day = datetime.strptime(data.get("date", ""), "%Y-%m-%d").date()
    except (ValueError, TypeError):
        fail("Choose a valid date.")
    if day.isoformat() != data["date"] or day < timezone.localdate() or day > timezone.localdate() + timedelta(days=180):
        fail("Choose today or a future date.")
    return {key: data[key] for key in ("facilityId", "sport", "date", "mode")}


def active_hold(hold):
    h = hold.payload
    if h.get("released"):
        return False
    record = BookingRecord.objects.select_related("booking").filter(hold=hold).first()
    if record:
        b = record.booking
        return b.status == "confirmed" or (b.status not in CLOSED and b.expires_at > timezone.now())
    return parse(h["expiresAt"]) > timezone.now()


def live_holds(ignore=None):
    return [h for h in Hold.objects.exclude(pk=ignore) if active_hold(h)]


def overlaps(a, b):
    return parse(a["startAt"]) < parse(b["endAt"]) and parse(b["startAt"]) < parse(a["endAt"])


def live_bookings():
    return Booking.objects.filter(Q(status="confirmed") | Q(status__in=["awaiting_payment", "pending_verification"], expires_at__gt=timezone.now()))


def session_data(s):
    return {"id": session_id(s), "name": s.name, "courtId": court_id(s.court), "courtName": s.court.name,
            "startAt": iso(s.starts_at), "endAt": iso(s.ends_at), "capacity": s.capacity, "amount": s.amount,
            "priceBand": "peak" if timezone.localtime(s.starts_at).hour >= 17 else "off-peak", "registeredCount": 0}


def sessions_for(ctx):
    return [session_data(s) for s in PlaySession.objects.filter(active=True, court__sport=ctx["sport"], starts_at__date=ctx["date"]).select_related("court").order_by("starts_at", "pk")]


def base_schedule(ctx):
    day = datetime.strptime(ctx["date"], "%Y-%m-%d").date()
    result = {**ctx, "serverNow": iso(timezone.now()), "courts": []}
    for c in Court.objects.filter(sport=ctx["sport"], active=True).order_by("pk"):
        identifier = court_id(c)
        slots = []
        for hour in range(8, 24):
            start = datetime.combine(day, time(hour), MANILA)
            slots.append({"id": f"{day}_{identifier}_{hour}", "courtId": identifier, "startAt": iso(start), "endAt": iso(start + timedelta(hours=1)),
                          "amount": c.hourly_amount, "status": "available", "priceBand": "peak" if 17 <= hour < 22 else "off-peak"})
        result["courts"].append({"id": identifier, "name": c.name, "kind": "Indoor", "slots": slots})
    return result


def availability(data, mode="court", credential=None):
    ctx = context({**data, "mode": mode})
    own = owner(credential) if credential else None
    held = live_holds()
    sessions = sessions_for(ctx)
    if mode == "open-play":
        for s in sessions:
            claims = [h for h in held if (h.payload.get("session") or {}).get("id") == s["id"]]
            canonical = find_session(s["id"])
            booked = live_bookings().filter(play_session=canonical)
            s["registeredCount"] = booked.filter(status="confirmed").count()
            pending = booked.exclude(status="confirmed").count()
            unconverted = [h for h in claims if not BookingRecord.objects.filter(hold=h).exists()]
            s["heldCount"] = pending + len(unconverted)
            s["heldByYou"] = any(h.owner == own and not h.payload.get("booked") for h in claims)
        return {**ctx, "serverNow": iso(timezone.now()), "sessions": sessions}
    result = base_schedule(ctx)
    canonical = list(live_bookings().select_related("court"))
    for c in result["courts"]:
        for slot in c["slots"]:
            claim = next((h for h in held if any(p["courtId"] == c["id"] and overlaps(p, slot) for p in h.payload["slots"])), None)
            if claim:
                slot["status"] = "booked" if claim.payload.get("booked") else "held"
                slot["heldByYou"] = slot["status"] == "held" and claim.owner == own
            elif any(s["courtId"] == c["id"] and overlaps(s, slot) for s in sessions) or any(court_id(b.court) == c["id"] and overlaps({"startAt": iso(b.starts_at), "endAt": iso(b.ends_at)}, slot) for b in canonical):
                slot["status"] = "booked"
    return result


def selection(data, ignore=None):
    ctx = context(data)
    held = live_holds(ignore)
    if ctx["mode"] == "open-play":
        s = next((s for s in sessions_for(ctx) if s["id"] == str(data.get("sessionId"))), None)
        if not s or parse(s["startAt"]) <= timezone.now():
            fail("This session has no available places.", "CONFLICT", 409)
        canonical = find_session(s["id"])
        allocated = live_bookings().filter(play_session=canonical).count()
        reserved = sum(1 for h in held if (h.payload.get("session") or {}).get("id") == s["id"] and not BookingRecord.objects.filter(hold=h).exists())
        conflicting = live_bookings().filter(court=canonical.court, starts_at__lt=canonical.ends_at, ends_at__gt=canonical.starts_at).exclude(play_session=canonical).exists()
        if allocated + reserved >= s["capacity"] or conflicting or any(any(p["courtId"] == s["courtId"] and overlaps(p, s) for p in h.payload["slots"]) for h in held):
            fail("This session has no available places.", "CONFLICT", 409)
        return {"context": ctx, "slots": [], "session": s, "quote": {"currency": "PHP", "totalAmount": s["amount"], "items": [{"id": s["id"], "amount": s["amount"]}]}}
    ids = data.get("slotIds")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 16 or any(not isinstance(i, str) for i in ids) or len(set(ids)) != len(ids):
        fail("Choose consecutive hours on one court.")
    slots = sorted([s for c in base_schedule(ctx)["courts"] for s in c["slots"] if s["id"] in ids], key=lambda s: s["startAt"])
    if len(slots) != len(ids) or any(s["courtId"] != slots[0]["courtId"] or parse(s["startAt"]) <= timezone.now() or (i and slots[i - 1]["endAt"] != s["startAt"]) for i, s in enumerate(slots)):
        fail("Choose future consecutive hours on one court.")
    canonical = list(live_bookings().select_related("court"))
    for slot in slots:
        if any(s["courtId"] == slot["courtId"] and overlaps(s, slot) for s in sessions_for(ctx)) or any(any(p["courtId"] == slot["courtId"] and overlaps(p, slot) for p in h.payload["slots"]) for h in held) or any(court_id(b.court) == slot["courtId"] and overlaps({"startAt": iso(b.starts_at), "endAt": iso(b.ends_at)}, slot) for b in canonical if not (ignore is not None and BookingRecord.objects.filter(booking=b, hold_id=ignore).exists())):
            fail("That court time has just been taken.", "CONFLICT", 409)
    return {"context": ctx, "slots": slots, "session": None, "quote": {"currency": "PHP", "totalAmount": sum(s["amount"] for s in slots), "items": [{"id": s["id"], "amount": s["amount"]} for s in slots]}}


def owned_hold(identifier, credential, inactive=False):
    h = Hold.objects.filter(pk=identifier, owner=owner(credential)).first()
    if not h:
        fail("Reservation not found.", "NOT_FOUND", 404)
    if not inactive and not active_hold(h):
        fail("Your hold has expired. Choose another time.", "HOLD_EXPIRED", 410)
    return h


def hold_action(operation, identifier, data, credential, key=None):
    own = owner(credential)
    fingerprint = digest(json.dumps({"operation": operation, "id": identifier, "input": data}, sort_keys=True))
    legacy_fingerprint = digest(json.dumps({"operation": operation, "id": identifier, "input": data}, separators=(",", ":"), ensure_ascii=False))
    if operation in {"create", "update"}:
        request_key(key)
        prior = HoldRequest.objects.filter(owner=own, key=key).first()
        if prior:
            if prior.fingerprint not in {fingerprint, legacy_fingerprint}:
                fail("This request identifier was already used for another change.", "CONFLICT", 409)
            return {**owned_hold(prior.hold_id, credential).payload, "serverNow": iso(timezone.now())}
    if operation == "create":
        if any(active_hold(h) for h in Hold.objects.filter(owner=own)):
            fail("Recover your existing reservation first.", "CONFLICT", 409)
        payload = {"id": uid(), **selection(data), "revision": 1, "expiresAt": iso(timezone.now() + timedelta(minutes=10)), "released": False}
        hold = Hold.objects.create(pk=payload["id"], owner=own, payload=payload)
    else:
        hold = owned_hold(identifier, credential, operation == "release")
        payload = hold.payload
        if operation == "get":
            return {**payload, "serverNow": iso(timezone.now())}
        if payload.get("paymentPending") or payload.get("booked"):
            fail("Contact staff to cancel this booking.", "PAYMENT_PENDING", 409)
        if operation == "release":
            payload["released"] = True
            hold.save(update_fields=["payload"])
            return {"released": True}
        if operation != "update" or payload["context"]["mode"] != "court" or data.get("revision") != payload["revision"]:
            fail("Your reservation changed. Check it before editing.", "REVISION_CONFLICT", 409)
        changed = selection(data, hold.pk)
        if changed["context"] != payload["context"] or changed["slots"][0]["courtId"] != payload["slots"][0]["courtId"]:
            fail("Cancel the existing hold before changing court or date.")
        payload.update(changed)
        payload["revision"] += 1
        hold.save(update_fields=["payload"])
    HoldRequest.objects.create(owner=own, key=key, fingerprint=fingerprint, hold=hold)
    return {**payload, "serverNow": iso(timezone.now())}


def customer(data, owner_hash=None, staff=False):
    if not isinstance(data, dict):
        fail("Enter the customer's name, email and mobile.")
    name, address, phone = text(data.get("name"), "a customer name", 120), email(data.get("email")), mobile(data.get("mobile"))
    if len(name) < 2:
        fail("Enter a full name of at least two characters.")
    # Reuse a guest only through the unguessable booking credential, never email.
    prior = CustomerProfile.objects.filter(name=name, email=address, mobile=phone).first() if staff else CustomerProfile.objects.filter(bookingrecord__owner=owner_hash, name=name, email=address, mobile=phone).first() if owner_hash else None
    if prior:
        return prior
    User = get_user_model()
    user = User(username=f"guest-{uuid.uuid4().hex}", email=address, first_name=name[:150])
    user.set_unusable_password()
    user.save()
    return CustomerProfile.objects.create(user=user, name=name, email=address, mobile=phone)


def audit(booking, actor, action, note=""):
    Audit.objects.create(booking=booking, actor=actor, action=action, note=note)


def payment_data(record):
    b = record.booking
    closed = b.status in CLOSED
    paid = b.status == "confirmed" or record.payment_status == "succeeded"
    proof = record.proofs.order_by("-submitted", "-id").first()
    result = {"id": record.payment_id, "reservationId": str(b.pk), "holdId": record.hold_id,
              "method": record.method, "amount": b.amount, "currency": "PHP", "status": "succeeded" if paid else "cancelled" if closed else "pending",
              "bookingStatus": "canceled" if closed else "confirmed" if paid else "none", "serverNow": iso(timezone.now()),
              "proofStatus": proof.status if proof else "submitted" if Receipt.objects.filter(booking=b).exists() else "not_submitted", "reviewReason": record.reason,
              "payee": b.payee, "account": b.account, "destinationLabel": b.destination_label,
              "expiresAt": iso(b.expires_at), "qrUrl": f"/api/payment-attempts/{record.payment_id}/qr"}
    if paid and not closed:
        result["bookingId"] = str(b.pk)
    return result


def make_payment(data, credential, key, actor=None):
    own = owner(credential)
    request_key(key)
    if type(data.get("holdRevision")) is not int or type(data.get("expectedAmount")) is not int:
        fail("Send the current hold revision and amount as whole numbers.")
    prior = BookingRecord.objects.filter(owner=own, payment_key=key).select_related("booking").first()
    if prior:
        if prior.hold_id != data.get("holdId") or prior.method != data.get("method") or prior.booking.amount != data.get("expectedAmount"):
            fail("The payment request changed.", "CONFLICT", 409)
        return payment_data(prior)
    hold = owned_hold(data.get("holdId"), credential)
    h = hold.payload
    if h.get("paymentPending") or h.get("booked") or data.get("holdRevision") != h["revision"] or data.get("expectedAmount") != h["quote"]["totalAmount"]:
        fail("Review the current reservation before paying.")
    method = data.get("method")
    if BookingRecord.objects.filter(owner=own, booking__status__in=["awaiting_payment", "pending_verification"], booking__expires_at__gt=timezone.now()).count() >= 3:
        fail("You already have three bookings awaiting payment or review.")
    if method not in (["cash", "unpaid", "gcash", "maya", "qrph"] if actor else ["gcash", "maya", "qrph"]) or h["quote"]["totalAmount"] <= 0:
        fail("Choose a valid payment method and positive price.")
    if not actor and method != "qrph":
        mobile(data.get("mobile"))
    checked_selection = selection({**h["context"], "slotIds": [p["id"] for p in h["slots"]], "sessionId": (h.get("session") or {}).get("id")}, hold.pk)
    if checked_selection["quote"] != h["quote"]:
        fail("Prices changed. Release this hold and choose your time again.", "HOLD_CHANGED", 409)
    profile = customer(data.get("guest"), own, staff=bool(actor))
    s = h.get("session")
    period = s or {"startAt": h["slots"][0]["startAt"], "endAt": h["slots"][-1]["endAt"]}
    cid = s["courtId"] if s else h["slots"][0]["courtId"]
    court = next((c for c in Court.objects.filter(active=True) if court_id(c) == cid), None)
    if not court:
        fail("Court is unavailable.")
    paid = bool(actor and method == "cash")
    canonical_session = find_session(s["id"]) if s else None
    b = payment_services.reserve(profile.user, court_id=court.pk,
        date=h["context"]["date"], start_hour=parse(period["startAt"]).hour,
        hours=len(h["slots"]) if not s else None, session_id=canonical_session.pk if canonical_session else None,
        request_key=uuid.uuid5(uuid.NAMESPACE_URL, own + key), hold_reference=hold.pk)
    if b.amount != data["expectedAmount"]:
        fail("The price changed. Review the reservation again.")
    record = BookingRecord.objects.create(booking=b, hold=hold, customer=profile, owner=own, payment_key=key, method=method, source="walk-in" if actor else "online", payment_status="succeeded" if paid else "pending", created_by=actor)
    h.update(paymentPending=not paid, booked=paid)
    hold.save(update_fields=["payload"])
    audit(b, actor, "booking_created")
    if paid:
        from .data import cash_received
        cash_received(b.pk, actor)
    return payment_data(record)


def walk_in(data, actor, key):
    credential = f"walk-in:{actor.pk}:{request_key(key)}"
    prior = BookingRecord.objects.filter(owner=owner(credential), payment_key=key).select_related("booking").first()
    if prior:
        return payment_data(prior)
    h = {"id": uid(), **selection(data), "revision": 1, "expiresAt": iso(timezone.now() + timedelta(minutes=10)), "released": False}
    Hold.objects.create(pk=h["id"], owner=owner(credential), payload=h)
    return make_payment({**data, "holdId": h["id"], "holdRevision": 1, "expectedAmount": h["quote"]["totalAmount"]}, credential, key, actor)


def receipt(identifier, credential):
    r = BookingRecord.objects.select_related("booking", "customer", "hold").filter(booking_id=identifier, owner=owner(credential), booking__status="confirmed").first()
    if not r or not r.hold:
        fail("Booking not found.", "NOT_FOUND", 404)
    h, b = r.hold.payload, r.booking
    return {"id": str(b.pk), "holdId": r.hold_id, "status": "confirmed", "reference": f"RR-{str(b.pk)[:8].upper()}", "guestName": r.customer.name,
            "facilityName": "Rim & Rally Sports Hub", "courtName": b.court.name, "context": h["context"], "slots": h["slots"], "session": h["session"], "amount": b.amount, "currency": "PHP", "method": r.method,
            "ticketToken": signing.dumps({"booking": str(b.pk), "nonce": r.ticket}, salt="rim-rally-pass", compress=True)}


def verify_ticket(token):
    try:
        value = signing.loads(token, salt="rim-rally-pass")
        record = BookingRecord.objects.select_related("booking").get(booking_id=value["booking"], ticket=value["nonce"], booking__status="confirmed")
    except (signing.BadSignature, BookingRecord.DoesNotExist, KeyError, ValueError):
        fail("This pass is invalid or the booking is no longer confirmed.", "INVALID_PASS", 404)
    return {"valid": True, "bookingId": str(record.booking_id), "starts": iso(record.booking.starts_at), "ends": iso(record.booking.ends_at)}


def guard_allocation(court, session, starts, ends, hold_reference=None):
    """Core reservations and frontend holds compete for the same inventory."""
    claims = [h for h in live_holds(hold_reference) if not BookingRecord.objects.filter(hold=h).exists()]
    period = {"startAt": iso(starts), "endAt": iso(ends)}
    seats = 0
    for hold in claims:
        items = hold.payload["slots"] or [hold.payload["session"]]
        for item in items:
            if item["courtId"] == court_id(court) and overlaps(item, period):
                if session and not hold.payload["slots"] and item["id"] == session_id(session):
                    seats += 1
                else:
                    raise ValidationError("This court time is held by another customer.")
    if session and seats + live_bookings().filter(play_session=session).count() >= session.capacity:
        raise ValidationError("This session is full or held by another customer.")
