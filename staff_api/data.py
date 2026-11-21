from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from django.contrib.auth import get_user_model
from django.db.models import Q, Count
from django.utils import timezone
from payments.models import Booking, Court, PlaySession, Receipt
from payments import services as payments
from payments.images import clean_image
from payments.models import ConfirmationEmail
from .models import Audit, BookingRecord, Cancellation, CustomerProfile, Proof, ScheduleIdentity
from . import domain as d
import hashlib


def status(b):
    if b.status in {"awaiting_payment", "pending_verification"}:
        return "reserved" if b.expires_at > timezone.now() else "expired"
    return "canceled" if b.status == "cancelled" else b.status


def booking_data(b):
    r = BookingRecord.objects.filter(booking=b).select_related("customer", "hold").first()
    p = r.customer if r else None
    proof = r.proofs.order_by("-submitted", "-id").first() if r else None
    paid = b.status == "confirmed" or bool(r and r.payment_status == "succeeded")
    return {"id": str(b.pk), "hold_id": r.hold_id if r else None, "customer_id": p.pk if p else f"user-{b.customer_id}",
        "type": "open-play" if b.play_session_id else "court", "court": b.court.name,
        "session_id": d.session_id(b.play_session) if b.play_session_id else None,
        "session_name": b.play_session.name if b.play_session_id else ((r.hold.payload.get("session") or {}).get("name") if r and r.hold else None),
        "starts": d.iso(b.starts_at), "ends": d.iso(b.ends_at), "amount": b.amount, "status": status(b),
        "source": r.source if r else "online", "created": d.iso(b.created_at), "name": p.name if p else b.customer.get_full_name() or b.customer_email,
        "email": p.email if p else b.customer_email, "mobile": p.mobile if p else "",
        "payee": b.payee, "account": b.account, "expires": d.iso(b.expires_at),
        "method": r.method if r else "qrph", "payment_status": "succeeded" if paid else "cancelled" if b.status in d.CLOSED else "pending",
        "proof_status": proof.status if proof else "submitted" if Receipt.objects.filter(booking=b).exists() else "not_submitted"}


def bookings(filters):
    query = Booking.objects.select_related("court", "play_session", "customer").all()
    if filters.get("q"):
        term = str(filters["q"])[:120]
        query = query.filter(Q(customer_email__icontains=term) | Q(customer__first_name__icontains=term) | Q(bookingrecord__customer__name__icontains=term) | Q(id__icontains=term))
    try:
        if filters.get("date"):
            datetime.strptime(filters["date"], "%Y-%m-%d")
            query = query.filter(starts_at__date=filters["date"])
    except (ValueError, TypeError):
        pass
    if filters.get("type") in {"court", "open-play"}:
        query = query.filter(play_session__isnull=filters["type"] == "court")
    st = filters.get("status")
    if st == "reserved":
        query = query.filter(status__in=["awaiting_payment", "pending_verification"], expires_at__gt=timezone.now())
    elif st in {"confirmed", "canceled", "expired", "rejected"}:
        query = query.filter(status="cancelled" if st == "canceled" else st)
    if filters.get("customerId"):
        cid = str(filters["customerId"])
        query = query.filter(customer_id=int(cid[5:])) if cid.startswith("user-") and cid[5:].isdigit() else query.filter(bookingrecord__customer_id=cid)
    if filters.get("sessionId"):
        query = query.filter(play_session=d.find_session(filters["sessionId"]))
    payment = filters.get("payment")
    if payment == "succeeded":
        query = query.filter(Q(status="confirmed") | Q(bookingrecord__payment_status="succeeded"))
    elif payment == "pending":
        query = query.filter(status__in=["awaiting_payment", "pending_verification"])
    elif payment == "cancelled":
        query = query.filter(status__in=d.CLOSED).exclude(bookingrecord__payment_status="succeeded")
    try:
        page = max(1, min(100000, int(filters.get("page", 1))))
    except (ValueError, TypeError):
        page = 1
    return [booking_data(b) for b in query.order_by("-created_at", "id")[(page - 1) * 50:page * 50 + 1]]


def meta(b):
    record, _ = BookingRecord.objects.get_or_create(booking=b, defaults={"method": "qrph", "payment_status": "succeeded" if b.status == "confirmed" else "pending"})
    return record


def details(identifier):
    b = Booking.objects.filter(pk=identifier).select_related("court", "customer", "play_session").first()
    if not b:
        return None
    data = booking_data(b)
    r = BookingRecord.objects.filter(booking=b).first()
    data["sessionAvailable"] = bool(b.play_session_id)
    data["payment"] = {"id": r.payment_id if r else str(b.pk), "method": data["method"], "status": data["payment_status"], "reason": r.reason if r else ""}
    data["proofs"] = [{"id": p.pk, "name": p.name, "mime": p.mime, "submitted": d.iso(p.submitted), "status": p.status, "reason": p.reason} for p in Proof.objects.filter(record__booking=b).order_by("-submitted", "-id")]
    if not data["proofs"]:
        old = Receipt.objects.filter(booking=b).first()
        if old:
            data["proofs"] = [{"id": f"receipt:{b.pk}", "name": "Payment receipt.png", "mime": "image/png", "submitted": d.iso(old.uploaded_at), "status": "verified" if b.status == "confirmed" else "submitted", "reason": ""}]
    cancellation = Cancellation.objects.filter(booking=b).first()
    data["cancellation"] = cancellation_data(cancellation) if cancellation else None
    data["history"] = [{"action": a.action, "at": d.iso(a.at), "note": a.note, "actor": a.actor.email if a.actor else None} for a in Audit.objects.filter(booking=b).select_related("actor").order_by("at", "id")]
    return data


def customers(search=""):
    term = str(search)[:120]
    profiles = CustomerProfile.objects.filter(Q(name__icontains=term) | Q(email__icontains=term) | Q(mobile__icontains=term)).order_by("name")[:100]
    result = [{"id": p.pk, "name": p.name, "email": p.email, "mobile": p.mobile, "bookings": BookingRecord.objects.filter(customer=p).count()} for p in profiles]
    users = get_user_model().objects.filter(booking__isnull=False).exclude(customerprofile__isnull=False).filter(Q(email__icontains=term) | Q(first_name__icontains=term) | Q(last_name__icontains=term)).distinct()[:100]
    result += [{"id": f"user-{u.pk}", "name": u.get_full_name() or u.email, "email": u.email, "mobile": "", "bookings": Booking.objects.filter(customer=u).count()} for u in users]
    return sorted(result, key=lambda r: r["name"])[:100]


def customer_data(identifier):
    if str(identifier).startswith("user-") and str(identifier)[5:].isdigit():
        u = get_user_model().objects.filter(pk=int(str(identifier)[5:])).first()
        return {"id": identifier, "name": u.get_full_name() or u.email, "email": u.email, "mobile": ""} if u else None
    p = CustomerProfile.objects.filter(pk=identifier).first()
    return {"id": p.pk, "name": p.name, "email": p.email, "mobile": p.mobile} if p else None


def schedule_data(s):
    identity = ScheduleIdentity.objects.filter(session=s).first()
    return {"id": d.session_id(s), "name": s.name, "sport": s.court.sport, "court": s.court.name, "starts": d.iso(s.starts_at), "ends": d.iso(s.ends_at), "capacity": s.capacity, "amount": s.amount, "status": "active" if s.active else "canceled", "version": identity.version if identity else 1}


def schedules():
    return [schedule_data(s) for s in PlaySession.objects.exclude(scheduleidentity__archived=True).select_related("court").order_by("starts_at", "id")]


def save_schedule(data):
    name = d.text(data.get("name"), "a session title", 100)
    sport, court_name = data.get("sport"), d.text(data.get("court"), "a court name", 80)
    court = Court.objects.filter(sport=sport, name__iexact=court_name, active=True).first()
    if not court:
        d.fail("Choose a court configured in Django for this sport.")
    try:
        day = datetime.strptime(data.get("date", ""), "%Y-%m-%d").date()
        start = datetime.combine(day, datetime.strptime(data.get("start", ""), "%H:%M").time(), d.MANILA)
        end = datetime.combine(day, datetime.strptime(data.get("end", ""), "%H:%M").time(), d.MANILA)
        if data["end"] == "00:00":
            end += timedelta(days=1)
        if start.hour < 8 or end <= start or end > datetime.combine(day + timedelta(days=1), datetime.min.time(), d.MANILA):
            raise ValueError()
    except (ValueError, TypeError):
        d.fail("Schedule a session between 8:00 AM and midnight, with an end after its start.")
    try:
        seats = int(str(data.get("capacity")))
        price = Decimal(str(data.get("price")))
        amount = int(price * 100)
        if not 1 <= seats <= 9999 or not price.is_finite() or not 0 < price <= Decimal("999999.99") or price * 100 != amount:
            raise ValueError()
    except (ValueError, TypeError, InvalidOperation, OverflowError):
        d.fail("Enter a positive capacity and a valid price in pesos.")
    session = d.find_session(data["id"]) if data.get("id") else None
    if data.get("id") and not session:
        d.fail("This schedule changed. Refresh and try again.")
    identity = ScheduleIdentity.objects.filter(session=session).first() if session else None
    if session and (not session.active or int(data.get("version", 0)) != (identity.version if identity else 1)):
        d.fail("This schedule changed or was canceled. Refresh before editing.")
    live = d.live_holds()
    taken = [h for h in live if (h.payload.get("session") or {}).get("id") == d.session_id(session)] if session else []
    canonical = d.live_bookings().filter(play_session=session) if session else Booking.objects.none()
    used = canonical.count() + sum(1 for h in taken if not BookingRecord.objects.filter(hold=h).exists())
    if used and (session.court_id != court.pk or session.starts_at != start or session.ends_at != end or session.amount != amount or seats < used):
        d.fail("This session has reservations. Keep its court, times and price, and retain enough capacity.")
    conflicting_bookings = d.live_bookings().filter(court=court, starts_at__lt=end, ends_at__gt=start)
    if session:
        conflicting_bookings = conflicting_bookings.exclude(play_session=session)
    if PlaySession.objects.filter(active=True, court=court, starts_at__lt=end, ends_at__gt=start).exclude(pk=session.pk if session else None).exists() or conflicting_bookings.exists():
        d.fail("Another session or booking overlaps this court and time.")
    period = {"startAt": d.iso(start), "endAt": d.iso(end)}
    if any(any(p["courtId"] == d.court_id(court) and d.overlaps(p, period) for p in h.payload["slots"]) for h in live):
        d.fail("A court booking or hold overlaps this session.")
    if not session:
        session = PlaySession.objects.create(court=court, name=name, starts_at=start, ends_at=end, capacity=seats, amount=amount)
        ScheduleIdentity.objects.create(session=session)
    else:
        session.court, session.name, session.starts_at, session.ends_at, session.capacity, session.amount = court, name, start, end, seats, amount
        session.save()
        identity, _ = ScheduleIdentity.objects.get_or_create(session=session)
        identity.version += 1
        identity.save()
    return {"message": "Schedule saved."}


def change_schedule(data):
    session = d.find_session(data.get("id"))
    if not session:
        d.fail("This schedule changed. Refresh and try again.")
    identity = ScheduleIdentity.objects.filter(session=session).first()
    if int(data.get("version", 0)) != (identity.version if identity else 1):
        d.fail("This schedule changed. Refresh and try again.")
    if d.live_bookings().filter(play_session=session).exists() or any((h.payload.get("session") or {}).get("id") == d.session_id(session) for h in d.live_holds()):
        d.fail("Cancel this session's bookings and active reservations first.")
    if data.get("operation") == "cancel" and session.active:
        session.active = False
        session.save(update_fields=["active"])
        identity, _ = ScheduleIdentity.objects.get_or_create(session=session)
        identity.version += 1
        identity.save()
    elif data.get("operation") == "delete":
        # Preserve protected canonical history while removing the schedule from
        # operational lists, as the existing Delete action promises.
        if Booking.objects.filter(play_session=session).exists():
            session.active = False
            session.save(update_fields=["active"])
            identity, _ = ScheduleIdentity.objects.get_or_create(session=session)
            identity.archived = True
            identity.version += 1
            identity.save()
        else:
            session.delete()
    else:
        d.fail("Invalid schedule action.")
    return {"message": "Schedule canceled." if data["operation"] == "cancel" else "Schedule deleted."}


def session_list(filters):
    now = timezone.now()
    result = []
    for s in PlaySession.objects.filter(active=True).select_related("court"):
        row = schedule_data(s)
        allocated = d.availability({"facilityId": "rim-and-rally", "sport": s.court.sport, "date": timezone.localtime(s.starts_at).date().isoformat()}, "open-play")["sessions"] if s.starts_at.date() >= timezone.localdate() else []
        count = next((v for v in allocated if v["id"] == row["id"]), {})
        row.update(type="open-play", registered=count.get("registeredCount", 0), held=count.get("heldCount", 0), remaining=max(0, s.capacity - count.get("registeredCount", 0) - count.get("heldCount", 0)), href=f"/dashboard/sessions/{row['id']}")
        result.append(row)
    for b in d.live_bookings().filter(play_session__isnull=True).select_related("court", "customer"):
        row = booking_data(b)
        row.update(name=f"{b.court.name} · {row['name']}", registered=1, href=f"/dashboard/bookings/{b.pk}")
        result.append(row)
    return sorted([r for r in result if (not filters.get("date") or r["starts"][:10] == filters["date"]) and (d.parse(r["starts"]) <= now < d.parse(r["ends"]) if filters.get("timing") == "current" else d.parse(r["starts"]) > now)], key=lambda r: r["starts"])


def cancellation_data(c):
    return {"id": c.pk, "booking_id": str(c.booking_id), "reason": c.reason, "requested": d.iso(c.requested), "status": c.status, "refund_status": c.refund_status, "decision": c.decision}


def cancellation_request(identifier, reason, credential=None, actor=None):
    b = Booking.objects.filter(pk=identifier).first()
    if not b:
        d.fail("Booking not found.", "NOT_FOUND", 404)
    if not actor:
        r = BookingRecord.objects.filter(booking=b, owner=d.owner(credential)).first()
        if not r:
            d.fail("Booking not found.", "NOT_FOUND", 404)
    if b.status in d.CLOSED:
        d.fail("This booking is already closed.")
    reason = d.text(reason, "a cancellation reason", 1000)
    c, created = Cancellation.objects.get_or_create(booking=b, defaults={"reason": reason})
    if created:
        d.audit(b, actor, "cancellation_requested", reason)
    return {"id": c.pk}


def complete_cancel(identifier, refund, decision, actor):
    b = Booking.objects.select_for_update().get(pk=identifier)
    c = Cancellation.objects.filter(booking=b).first()
    if not c:
        d.fail("Request a cancellation first.")
    if c.status == "completed":
        return {"message": "Booking already canceled."}
    r = meta(b)
    paid = b.status == "confirmed" or r.payment_status == "succeeded"
    decision = d.text(decision, "the cancellation decision", 1000)
    if paid and refund not in {"pending", "refunded", "not_due"}:
        d.fail("Record a refund decision for this paid booking.")
    b.status = "cancelled"
    b.save(update_fields=["status"])
    r.payment_status = "succeeded" if paid else "cancelled"
    r.save(update_fields=["payment_status"])
    if r.hold:
        r.hold.payload.update(released=True, booked=False, paymentPending=False)
        r.hold.save(update_fields=["payload"])
    c.status, c.refund_status, c.decision, c.processed_by, c.processed = "completed", refund if paid else "not_required", decision, actor, timezone.now()
    c.save()
    d.audit(b, actor, "cancellation_completed", decision)
    return {"message": "Booking canceled and availability released."}


def upload(record, file, actor=None, reference=None):
    reference = d.text(reference, "the payment transaction reference", 120)
    raw = clean_image(file)
    b = record.booking
    payments.upload_receipt(b.customer, b.pk, raw, reference)
    existing = record.proofs.order_by("-submitted").first()
    if existing:
        return {"id": existing.pk, "message": "Proof already submitted."}
    proof = Proof.objects.create(record=record, name="Payment proof.png", mime="image/png", content=raw)
    record.reason = ""
    record.save(update_fields=["reason"])
    d.audit(b, actor, "proof_submitted")
    return {"id": proof.pk}


def review_proof(identifier, outcome, reason, bank_reference, actor):
    proof = Proof.objects.select_related("record__booking").filter(pk=identifier).first()
    if str(identifier).startswith("receipt:"):
        b = Booking.objects.get(pk=str(identifier)[8:])
        old = Receipt.objects.get(booking=b)
        proof = Proof.objects.create(record=meta(b), name="Payment receipt.png", mime="image/png", content=bytes(old.image), submitted=old.uploaded_at)
    if not proof:
        d.fail("Proof not found.")
    b, record = proof.record.booking, proof.record
    reason = d.text(reason or "", "a review reason", 1000, required=outcome == "rejected")
    if proof.status == outcome:
        return {"message": "Payment proof already reviewed."}
    if outcome not in {"verified", "rejected"} or proof.status != "submitted" or b.status in d.CLOSED or b.status == "confirmed":
        d.fail("This proof has already been reviewed or the booking is closed.")
    if outcome == "verified":
        reference = d.text(bank_reference, "the transaction reference checked in the owner's account", 120)
        # Reuse backend validation, unique transfer references, audit and email queue.
        payments.review(actor, b.pk, "confirm", reason or "Payment verified in staff dashboard", reference)
        record.payment_status = "succeeded"
        if record.hold:
            record.hold.payload.update(booked=True, paymentPending=False)
            record.hold.save(update_fields=["payload"])
    else:
        payments.review(actor, b.pk, "reject", reason)
        if record.hold:
            record.hold.payload.update(released=True, booked=False, paymentPending=False)
            record.hold.save(update_fields=["payload"])
    proof.status, proof.reason, proof.reviewed_by, proof.reviewed = outcome, reason, actor, timezone.now()
    proof.save()
    record.reason = reason
    record.save()
    d.audit(b, actor, f"proof_{outcome}", reason)
    return {"message": "Payment proof reviewed."}


def record_refund(identifier, decision, actor):
    cancellation = Cancellation.objects.select_for_update().filter(booking_id=identifier).first()
    if not cancellation or cancellation.status != "completed" or cancellation.refund_status not in {"pending", "refunded"}:
        d.fail("Complete the cancellation and record a pending refund first.")
    if cancellation.refund_status == "refunded":
        return {"message": "Refund already recorded."}
    cancellation.decision = d.text(decision, "the refund reference or explanation", 1000)
    cancellation.refund_status, cancellation.processed_by = "refunded", actor
    cancellation.save()
    d.audit(cancellation.booking, actor, "refund_recorded", cancellation.decision)
    return {"message": "Refund recorded. No money was transferred by this website."}


def cash_received(identifier, actor):
    booking = Booking.objects.select_for_update().get(pk=identifier)
    record = meta(booking)
    if record.source != "walk-in":
        d.fail("Cash collection is available only for staff-created walk-in bookings.")
    if booking.status == "confirmed" and record.method == "cash":
        return {"message": "Cash already recorded."}
    if booking.status != "awaiting_payment" or booking.expires_at <= timezone.now() or Receipt.objects.filter(booking=booking).exists():
        d.fail("Only an unpaid, unexpired walk-in without proof can be marked paid in cash.")
    booking.status = "confirmed"
    booking.bank_reference = "CASH-" + str(booking.pk).upper()
    booking.save(update_fields=["status", "bank_reference"])
    record.payment_status, record.method = "succeeded", "cash"
    record.save(update_fields=["payment_status", "method"])
    if record.hold:
        record.hold.payload.update(booked=True, paymentPending=False)
        record.hold.save(update_fields=["payload"])
    ConfirmationEmail.objects.get_or_create(booking=booking, defaults={"recipient": booking.customer_email,
        "subject": "Rim & Rally booking confirmed", "body": f"Booking {booking.pk} confirmed. Cash received: PHP {booking.pesos}. Court: {booking.court.name}.", "next_attempt_at": timezone.now()})
    d.audit(booking, actor, "cash_received")
    return {"message": "Cash payment recorded."}
