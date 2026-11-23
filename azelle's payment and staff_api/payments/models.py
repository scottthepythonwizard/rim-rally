import uuid
from django.conf import settings
from django.db import models
from django.db.models import Q


class Court(models.Model):
    name = models.CharField(max_length=80)
    sport = models.CharField(max_length=20, choices=[("pickleball", "Pickleball"), ("basketball", "Basketball")])
    hourly_amount = models.PositiveIntegerField(default=40000, help_text="PHP centavos: 40000 = ₱400")
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class PlaySession(models.Model):
    court = models.ForeignKey(Court, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    capacity = models.PositiveIntegerField(default=12)
    amount = models.PositiveIntegerField(help_text="Per player in PHP centavos")
    active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(ends_at__gt=models.F("starts_at")) & Q(capacity__gt=0) & Q(amount__gt=0), name="valid_play_session")]

    def __str__(self):
        return self.name


class PaymentDestination(models.Model):
    label = models.CharField(max_length=80, help_text="e.g. GCash / Maya / bank QR")
    payee = models.CharField(max_length=120)
    account = models.CharField(max_length=120)
    qr_data = models.BinaryField(editable=False)
    active = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["active"], condition=Q(active=True), name="one_active_destination")]

    def __str__(self):
        return f"{self.label} — {self.payee}"


class Booking(models.Model):
    class Status(models.TextChoices):
        AWAITING = "awaiting_payment", "Awaiting payment"
        PENDING = "pending_verification", "Pending verification"
        CONFIRMED = "confirmed", "Confirmed"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        CANCELLED = "cancelled", "Cancelled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    customer_email = models.EmailField(editable=False)
    request_key = models.UUIDField()
    court = models.ForeignKey(Court, on_delete=models.PROTECT)
    play_session = models.ForeignKey(PlaySession, null=True, blank=True, on_delete=models.PROTECT)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    amount = models.PositiveIntegerField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.AWAITING)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    destination_label = models.CharField(max_length=80)
    payee = models.CharField(max_length=120)
    account = models.CharField(max_length=120)
    qr_data = models.BinaryField(editable=False)
    bank_reference = models.CharField(max_length=120, blank=True)

    @property
    def pesos(self):
        return f"{self.amount / 100:.2f}"

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["customer", "request_key"], name="booking_request_once"),
            models.CheckConstraint(condition=Q(ends_at__gt=models.F("starts_at")) & Q(amount__gt=0), name="valid_booking"),
            models.UniqueConstraint(fields=["bank_reference"], condition=~Q(bank_reference=""), name="unique_verified_transfer"),
        ]
        indexes = [models.Index(fields=["court", "status", "starts_at", "ends_at"]), models.Index(fields=["status", "expires_at"])]


class Receipt(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="receipt")
    image = models.BinaryField(editable=False)
    sha256 = models.CharField(max_length=64, unique=True)
    customer_reference = models.CharField(max_length=120)
    uploaded_at = models.DateTimeField(auto_now_add=True)


class Review(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT, related_name="review")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    decision = models.CharField(max_length=20)
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)


class ConfirmationEmail(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.PROTECT)
    recipient = models.EmailField()
    subject = models.CharField(max_length=200)
    body = models.TextField()
    sent_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)
    next_attempt_at = models.DateTimeField()
    lease_token = models.UUIDField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)
