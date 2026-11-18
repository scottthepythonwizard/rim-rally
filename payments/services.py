import hashlib
import uuid
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo
from django.conf import settings
from django.core.exceptions import ValidationError, PermissionDenied
from django.db import transaction, IntegrityError
from django.db.models import Q
from django.utils import timezone
from .models import Booking, Court, PlaySession, PaymentDestination, Receipt, Review, ConfirmationEmail

MANILA = ZoneInfo("Asia/Manila")
LIVE = [Booking.Status.AWAITING, Booking.Status.PENDING, Booking.Status.CONFIRMED]


def require_customer(user):
    if not user.is_authenticated or not user.is_active or not user.email:
        raise PermissionDenied("Sign in with an active customer account and email.")


def expire_bookings(now=None):
    now = now or timezone.now()
    return Booking.objects.filter(status__in=[Booking.Status.AWAITING, Booking.Status.PENDING], expires_at__lte=now).update(status=Booking.Status.EXPIRED)


def active_bookings(now):
    return Booking.objects.filter(Q(status=Booking.Status.CONFIRMED) | Q(status__in=[Booking.Status.AWAITING, Booking.Status.PENDING], expires_at__gt=now))


def reserve(user, *, court_id, date, start_hour, hours, session_id, request_key):
    require_customer(user)
    try:
        request_key = uuid.UUID(str(request_key))
        court_id = int(court_id)
    except (ValueError, TypeError, OverflowError):
        raise ValidationError("Invalid court or request key.") from None
    # SQLite settings use BEGIN IMMEDIATE; PostgreSQL deployments must retain this court row lock.
    with transaction.atomic():
        court = Court.objects.select_for_update().filter(pk=court_id, active=True).first()
        if not court:
            raise ValidationError("Court is unavailable.")
        now = timezone.now()
        expire_bookings(now)
        session = None
        if session_id:
            session = PlaySession.objects.filter(pk=session_id, court=court, active=True).first()
            if not session:
                raise ValidationError("Open Play session is unavailable.")
            starts, ends, amount = session.starts_at, session.ends_at, session.amount
        else:
            try:
                day = datetime.strptime(date, "%Y-%m-%d").date()
                hour, duration = int(start_hour), int(hours)
                if not (8 <= hour <= 23 and 1 <= duration <= 16 and hour + duration <= 24):
                    raise ValueError()
                starts = datetime.combine(day, time(hour), MANILA)
                ends = starts + timedelta(hours=duration)
                amount = court.hourly_amount * duration
            except (TypeError, ValueError):
                raise ValidationError("Choose consecutive hours between 8 AM and midnight.") from None
        prior = Booking.objects.filter(customer=user, request_key=request_key).first()
        if prior:
            if (prior.court_id, prior.play_session_id, prior.starts_at, prior.ends_at) != (court.pk, session.pk if session else None, starts, ends):
                raise ValidationError("This request key was already used for another selection.")
            return prior
        if starts <= now or starts > now + timedelta(days=180) or amount <= 0:
            raise ValidationError("Choose a future session within 180 days with a valid price.")
        if active_bookings(now).filter(customer=user, status__in=[Booking.Status.AWAITING, Booking.Status.PENDING]).count() >= 3:
            raise ValidationError("You already have three bookings awaiting payment or review.")
        overlaps = active_bookings(now).filter(court=court, starts_at__lt=ends, ends_at__gt=starts)
        if session:
            if overlaps.exclude(play_session=session).exists() or overlaps.filter(play_session=session).count() >= session.capacity:
                raise ValidationError("This session is full or the court is already reserved.")
        elif overlaps.exists() or PlaySession.objects.filter(court=court, active=True, starts_at__lt=ends, ends_at__gt=starts).exists():
            raise ValidationError("This court time is unavailable.")
        destination = PaymentDestination.objects.filter(active=True).first()
        if not destination or not destination.qr_data:
            raise ValidationError("The owner has not configured payment instructions yet.")
        try:
            # Nested savepoint permits a clean retry after uniqueness conflicts.
            with transaction.atomic():
                return Booking.objects.create(customer=user, customer_email=user.email, request_key=request_key,
                    court=court, play_session=session, starts_at=starts, ends_at=ends, amount=amount,
                    expires_at=min(now + timedelta(minutes=settings.PAYMENT_HOLD_MINUTES), starts),
                    destination_label=destination.label, payee=destination.payee, account=destination.account,
                    qr_data=bytes(destination.qr_data))
        except IntegrityError:
            prior = Booking.objects.filter(customer=user, request_key=request_key).first()
            if prior:
                return prior
            raise ValidationError("The booking could not be reserved. Refresh and try again.") from None


def upload_receipt(user, booking_id, image, reference):
    require_customer(user)
    reference = str(reference).strip()
    if not reference or len(reference) > 120:
        raise ValidationError("Enter the payment transaction reference (up to 120 characters).")
    image_hash = hashlib.sha256(image).hexdigest()
    with transaction.atomic():
        booking = Booking.objects.select_for_update().get(pk=booking_id, customer=user)
        existing = Receipt.objects.filter(booking=booking).first()
        if existing and existing.sha256 == image_hash and existing.customer_reference == reference:
            return booking
        now = timezone.now()
        if booking.status != Booking.Status.AWAITING or booking.expires_at <= now or booking.starts_at <= now:
            raise ValidationError("The payment deadline has passed or a receipt was already submitted. Contact the owner if money was sent.")
        try:
            with transaction.atomic():
                Receipt.objects.create(booking=booking, image=image, sha256=image_hash, customer_reference=reference)
        except IntegrityError:
            raise ValidationError("This receipt has already been submitted. Contact the owner.") from None
        booking.status = Booking.Status.PENDING
        booking.expires_at = min(now + timedelta(hours=settings.PAYMENT_REVIEW_HOURS), booking.starts_at)
        booking.save(update_fields=["status", "expires_at"])
        return booking


def cancel(user, booking_id):
    with transaction.atomic():
        booking = Booking.objects.select_for_update().get(pk=booking_id, customer=user)
        if booking.status == Booking.Status.CANCELLED:
            return
        if booking.status != Booking.Status.AWAITING:
            raise ValidationError("Only an unpaid booking can be cancelled here. Contact the owner about payments already sent.")
        booking.status = Booking.Status.CANCELLED
        booking.save(update_fields=["status"])


def review(actor, booking_id, decision, note, bank_reference=""):
    if not actor.is_active or not actor.is_staff or not actor.has_perm("payments.change_booking"):
        raise PermissionDenied()
    note, bank_reference = note.strip(), bank_reference.strip().upper()
    if decision not in {"confirm", "reject"} or not note or len(note) > 2000:
        raise ValidationError("Choose a decision and enter a review note (up to 2000 characters).")
    if decision == "confirm" and not (1 <= len(bank_reference) <= 120):
        raise ValidationError("Enter the transaction reference verified in the owner's account.")
    with transaction.atomic():
        booking = Booking.objects.select_for_update().select_related("court", "play_session").get(pk=booking_id)
        previous = Review.objects.filter(booking=booking).first()
        if previous:
            if previous.decision == decision:
                return booking
            raise ValidationError("This booking has already been reviewed.")
        now = timezone.now()
        if booking.status != Booking.Status.PENDING or booking.expires_at <= now or booking.starts_at <= now:
            raise ValidationError("Only a live booking pending verification can be reviewed. Expired payments require manual refund/reconciliation.")
        if not Receipt.objects.filter(booking=booking).exists():
            raise ValidationError("A receipt is required.")
        booking.status = Booking.Status.CONFIRMED if decision == "confirm" else Booking.Status.REJECTED
        booking.bank_reference = bank_reference if decision == "confirm" else ""
        try:
            with transaction.atomic():
                booking.save(update_fields=["status", "bank_reference"])
        except IntegrityError:
            raise ValidationError("This verified transaction reference was used for another booking.") from None
        Review.objects.create(booking=booking, reviewer=actor, decision=decision, note=note)
        if decision == "confirm":
            local_start = timezone.localtime(booking.starts_at)
            local_end = timezone.localtime(booking.ends_at)
            ConfirmationEmail.objects.create(booking=booking, recipient=booking.customer_email,
                subject="Rim & Rally booking confirmed",
                body=f"Your booking is confirmed.\nBooking: {booking.id}\nCourt: {booking.court.name}\nType: {'Open Play' if booking.play_session_id else 'Court rental'}\nStart: {local_start:%Y-%m-%d %I:%M %p}\nEnd: {local_end:%Y-%m-%d %I:%M %p} (Asia/Manila)\nAmount: PHP {booking.pesos}\nPayment reference: {bank_reference}\n",
                next_attempt_at=now)
        return booking
