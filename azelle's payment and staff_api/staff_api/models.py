"""Frontend compatibility records. Courts, sessions, bookings and users stay canonical."""
import uuid
from django.conf import settings
from django.db import models
from django.utils import timezone
from payments.models import Booking, Court, PlaySession


def identifier():
    return str(uuid.uuid4())


class StaffIdentity(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    legacy_id = models.CharField(max_length=64, unique=True, null=True)
    version = models.PositiveIntegerField(default=0)


class Invitation(models.Model):
    hash = models.CharField(max_length=64, primary_key=True)
    email = models.EmailField()
    role = models.CharField(max_length=10, choices=[("staff", "Staff"), ("admin", "Admin")])
    expires = models.DateTimeField()
    bootstrap = models.BooleanField(default=False)


class LoginLimit(models.Model):
    key = models.CharField(max_length=80, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    expires = models.DateTimeField()


class CourtIdentity(models.Model):
    id = models.CharField(max_length=100, primary_key=True)
    court = models.OneToOneField(Court, on_delete=models.CASCADE)


class ScheduleIdentity(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=identifier)
    session = models.OneToOneField(PlaySession, on_delete=models.CASCADE)
    version = models.PositiveIntegerField(default=1)
    archived = models.BooleanField(default=False)


class CustomerProfile(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=identifier)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    name = models.CharField(max_length=120)
    email = models.EmailField()
    mobile = models.CharField(max_length=24)

    class Meta:
        indexes = [models.Index(fields=["email", "mobile"], name="guest_contact_lookup")]


class Hold(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=identifier)
    owner = models.CharField(max_length=64, db_index=True)
    payload = models.JSONField()


class HoldRequest(models.Model):
    owner = models.CharField(max_length=64)
    key = models.CharField(max_length=200)
    fingerprint = models.CharField(max_length=64)
    hold = models.ForeignKey(Hold, on_delete=models.PROTECT)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner", "key"], name="staff_hold_request_once")]


class BookingRecord(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, primary_key=True)
    hold = models.OneToOneField(Hold, on_delete=models.PROTECT, null=True)
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, null=True)
    source = models.CharField(max_length=10, default="online")
    payment_id = models.CharField(max_length=64, unique=True, default=identifier)
    payment_key = models.CharField(max_length=200, null=True)
    owner = models.CharField(max_length=64, null=True)
    method = models.CharField(max_length=10, default="gcash")
    payment_status = models.CharField(max_length=12, default="pending")
    reason = models.CharField(max_length=1000, blank=True)
    ticket = models.CharField(max_length=100, default=identifier)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["owner", "payment_key"], name="staff_payment_request_once")]


class Proof(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=identifier)
    record = models.ForeignKey(BookingRecord, on_delete=models.PROTECT, related_name="proofs")
    name = models.CharField(max_length=180)
    mime = models.CharField(max_length=80)
    content = models.BinaryField()
    submitted = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=12, default="submitted")
    reason = models.CharField(max_length=1000, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    reviewed = models.DateTimeField(null=True)


class Cancellation(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=identifier)
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT)
    reason = models.CharField(max_length=1000)
    requested = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=12, default="requested")
    refund_status = models.CharField(max_length=16, default="not_required")
    decision = models.CharField(max_length=1000, blank=True)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    processed = models.DateTimeField(null=True)


class Audit(models.Model):
    id = models.CharField(max_length=64, primary_key=True, default=identifier)
    booking = models.ForeignKey(Booking, on_delete=models.PROTECT)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True)
    action = models.CharField(max_length=40)
    at = models.DateTimeField(default=timezone.now)
    note = models.CharField(max_length=1000, blank=True)


class ImportRun(models.Model):
    sha256 = models.CharField(max_length=64, primary_key=True)
    completed = models.DateTimeField(default=timezone.now)
    report = models.JSONField()
