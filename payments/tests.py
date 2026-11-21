from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO, StringIO
from threading import Barrier
import uuid
from unittest.mock import patch
from PIL import Image
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import close_old_connections, connection
from django.test import Client, TestCase, TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from . import services
from .images import clean_image
from .models import Booking, Court, PaymentDestination, PlaySession, Receipt, Review, ConfirmationEmail


def picture(color="white"):
    data = BytesIO()
    Image.new("RGB", (32, 32), color).save(data, format="PNG")
    return data.getvalue()


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend", PAYMENT_HOLD_MINUTES=10, PAYMENT_REVIEW_HOURS=24)
class PaymentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.customer = get_user_model().objects.create_user("customer@example.com", "customer@example.com", "longpassword-example-123")
        cls.other = get_user_model().objects.create_user("other@example.com", "other@example.com", "longpassword-example-123")
        cls.admin = get_user_model().objects.create_superuser("owner", "owner@example.com", "longpassword-example-123")
        cls.court = Court.objects.create(name="Basketball half-court", sport="basketball")
        cls.destination = PaymentDestination.objects.create(label="Owner QR", payee="Owner Name", account="09171234567", qr_data=picture(), active=True)

    def reserve(self, user=None, hour=10, key=None):
        date = (timezone.localdate() + timedelta(days=2)).isoformat()
        return services.reserve(user or self.customer, court_id=self.court.pk, date=date, start_hour=hour,
            hours=1, session_id=None, request_key=key or uuid.uuid4())

    def pending(self, color="white", hour=10, user=None):
        booking = self.reserve(user, hour=hour)
        return services.upload_receipt(user or self.customer, booking.pk, picture(color), "CUSTOMER-REF")

    def test_full_flow_price_snapshot_confirmation_and_email(self):
        booking = self.reserve()
        self.assertEqual(booking.amount, 40000)
        self.assertEqual(booking.status, "awaiting_payment")
        self.court.hourly_amount = 99999
        self.court.save()
        self.destination.payee = "Changed name"
        self.destination.save()
        pending = services.upload_receipt(self.customer, booking.pk, picture(), "REF-100")
        self.assertEqual(pending.status, "pending_verification")
        self.assertFalse(ConfirmationEmail.objects.exists())
        result = services.review(self.admin, booking.pk, "confirm", "Matched amount and transfer in wallet", " BANK-123 ")
        self.assertEqual(result.status, "confirmed")
        self.assertEqual(result.amount, 40000)
        self.assertEqual(result.payee, "Owner Name")
        self.assertEqual(result.bank_reference, "BANK-123")
        call_command("send_payment_emails", stdout=StringIO())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.customer.email])
        self.assertIn("PHP 400.00", mail.outbox[0].body)
        self.assertIsNotNone(ConfirmationEmail.objects.get().sent_at)

    def test_reservation_retry_and_changed_selection(self):
        key = uuid.uuid4()
        original = self.reserve(key=key)
        self.assertEqual(original.pk, self.reserve(key=key).pk)
        with self.assertRaises(ValidationError):
            self.reserve(hour=11, key=key)
        self.assertEqual(Booking.objects.count(), 1)

    def test_conflicts_and_expiry_allow_rebooking(self):
        booking = self.reserve()
        with self.assertRaises(ValidationError):
            self.reserve(self.other)
        Booking.objects.filter(pk=booking.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        new = self.reserve(self.other)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "expired")
        self.assertNotEqual(new.pk, booking.pk)
        with self.assertRaises(ValidationError):
            services.upload_receipt(self.customer, booking.pk, picture(), "LATE")

    def test_pending_expires_receipt_remains_and_cannot_confirm(self):
        booking = self.pending()
        Booking.objects.filter(pk=booking.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        call_command("expire_bookings", stdout=StringIO())
        booking.refresh_from_db()
        self.assertEqual(booking.status, "expired")
        self.assertTrue(Receipt.objects.filter(booking=booking).exists())
        with self.assertRaises(ValidationError):
            services.review(self.admin, booking.pk, "confirm", "Late transfer", "BANK-LATE")
        self.reserve(self.other)

    def test_duplicate_upload_and_review_do_not_duplicate_notifications(self):
        booking = self.pending()
        again = services.upload_receipt(self.customer, booking.pk, picture(), "CUSTOMER-REF")
        self.assertEqual(again.status, "pending_verification")
        services.review(self.admin, booking.pk, "confirm", "Verified", "BANK-1")
        services.review(self.admin, booking.pk, "confirm", "Verified", "BANK-1")
        self.assertEqual(Receipt.objects.count(), 1)
        self.assertEqual(Review.objects.count(), 1)
        self.assertEqual(ConfirmationEmail.objects.count(), 1)
        call_command("send_payment_emails", stdout=StringIO())
        call_command("send_payment_emails", stdout=StringIO())
        self.assertEqual(len(mail.outbox), 1)

    def test_receipt_reuse_and_verified_reference_reuse_blocked(self):
        first = self.pending()
        second = self.reserve(self.other, hour=11)
        with self.assertRaises(ValidationError):
            services.upload_receipt(self.other, second.pk, picture(), "SAME-IMAGE")
        services.upload_receipt(self.other, second.pk, picture("red"), "DIFFERENT")
        services.review(self.admin, first.pk, "confirm", "Verified", "BANK-1")
        with self.assertRaises(ValidationError):
            services.review(self.admin, second.pk, "confirm", "Verified", "bank-1")
        second.refresh_from_db()
        self.assertEqual(second.status, "pending_verification")

    def test_rejection_releases_slot_and_preserves_audit(self):
        booking = self.pending()
        services.review(self.admin, booking.pk, "reject", "Transfer was not received")
        self.reserve(self.other)
        self.assertFalse(ConfirmationEmail.objects.exists())
        self.assertEqual(Review.objects.get().reviewer, self.admin)

    def test_receipt_and_booking_access_are_owner_only(self):
        booking = self.pending()
        self.client.force_login(self.other)
        for route in ["detail", "qr", "receipt"]:
            self.assertEqual(self.client.get(reverse(f"payments:{route}", args=[booking.pk])).status_code, 404)
        self.client.force_login(self.customer)
        response = self.client.get(reverse("payments:receipt", args=[booking.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertIn("no-store", response["Cache-Control"])
        with self.assertRaises(PermissionDenied):
            services.review(self.customer, booking.pk, "confirm", "Fake", "FAKE")

    def test_browse_public_reserve_requires_login_and_csrf(self):
        self.assertEqual(self.client.get(reverse("payments:book")).status_code, 200)
        self.assertEqual(self.client.post(reverse("payments:book"), HTTP_ACCEPT="application/json").status_code, 401)
        self.assertFalse(Booking.objects.exists())
        secure = Client(enforce_csrf_checks=True)
        secure.force_login(self.customer)
        self.assertEqual(secure.post(reverse("payments:book"), {}).status_code, 403)

    def test_real_http_receipt_form_and_customer_status(self):
        booking = self.reserve()
        self.client.force_login(self.customer)
        url = reverse("payments:detail", args=[booking.pk])
        response = self.client.post(url, {"reference": "REF-100", "proof": SimpleUploadedFile("proof.png", picture(), content_type="image/png")})
        self.assertRedirects(response, url)
        data = self.client.get(url, HTTP_ACCEPT="application/json").json()
        self.assertEqual(data["status"], "pending_verification")
        self.assertEqual(data["amount"], 40000)
        self.assertNotIn("customer_email", data)

    def test_admin_review_requires_permission_and_check(self):
        booking = self.pending()
        self.client.force_login(self.admin)
        url = reverse("admin:payments_booking_review", args=[booking.pk])
        page = self.client.get(url)
        self.assertContains(page, "CUSTOMER-REF")
        response = self.client.post(url, {"decision": "confirm", "note": "Checked", "bank_reference": "BANK-1"})
        self.assertEqual(response.status_code, 200)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "pending_verification")
        self.client.post(url, {"decision": "confirm", "note": "Checked", "bank_reference": "BANK-1", "checked": "on"})
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")

    def test_image_validation_ignores_claimed_mime_and_rejects_malformed(self):
        with self.assertRaises(ValidationError):
            clean_image(SimpleUploadedFile("fake.png", b"<script>bad</script>", content_type="image/png"))
        with self.assertRaises(ValidationError):
            clean_image(SimpleUploadedFile("huge.png", b"a" * (5 * 1024 * 1024 + 1)))
        cleaned = clean_image(SimpleUploadedFile("real.jpg", picture() + b"<script>bad</script>"))
        self.assertNotIn(b"<script>", cleaned)

    def test_open_play_capacity_and_court_conflict(self):
        starts = timezone.now() + timedelta(days=3)
        session = PlaySession.objects.create(court=self.court, name="Open Play", starts_at=starts, ends_at=starts + timedelta(hours=2), capacity=1, amount=15000)
        first = services.reserve(self.customer, court_id=self.court.pk, date=None, start_hour=None, hours=None, session_id=session.pk, request_key=uuid.uuid4())
        self.assertEqual(first.amount, 15000)
        with self.assertRaises(ValidationError):
            services.reserve(self.other, court_id=self.court.pk, date=None, start_hour=None, hours=None, session_id=session.pk, request_key=uuid.uuid4())

    def test_email_failures_retry_without_losing_confirmation(self):
        booking = self.pending()
        services.review(self.admin, booking.pk, "confirm", "Verified", "BANK-1")
        with patch("django.core.mail.EmailMessage.send", side_effect=OSError("SMTP unavailable")):
            call_command("send_payment_emails", stdout=StringIO(), stderr=StringIO())
        job = ConfirmationEmail.objects.get()
        self.assertIsNone(job.sent_at)
        self.assertEqual(job.attempts, 1)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")
        ConfirmationEmail.objects.update(next_attempt_at=timezone.now())
        call_command("send_payment_emails", stdout=StringIO())
        self.assertEqual(len(mail.outbox), 1)

    def test_email_worker_skips_active_lease_and_recovers_abandoned_lease(self):
        booking = self.pending()
        services.review(self.admin, booking.pk, "confirm", "Verified", "BANK-1")
        ConfirmationEmail.objects.update(lease_token=uuid.uuid4(), locked_until=timezone.now() + timedelta(minutes=5))
        call_command("send_payment_emails", stdout=StringIO())
        self.assertEqual(ConfirmationEmail.objects.get().attempts, 0)
        ConfirmationEmail.objects.update(locked_until=timezone.now() - timedelta(seconds=1))
        call_command("send_payment_emails", stdout=StringIO())
        self.assertEqual(ConfirmationEmail.objects.get().attempts, 1)
        self.assertEqual(len(mail.outbox), 1)

    def test_signup_stores_signed_in_email_and_blocks_duplicate(self):
        form = {"email": "New@Example.com", "password1": "Complex-password-12345", "password2": "Complex-password-12345"}
        response = self.client.post(reverse("payments:signup"), form)
        self.assertEqual(response.status_code, 302)
        account = get_user_model().objects.get(username="new@example.com")
        self.assertEqual(account.email, "new@example.com")
        self.assertFalse(account.is_staff)
        self.client.logout()
        self.assertContains(self.client.post(reverse("payments:signup"), form), "An account already uses this email")

    def test_customer_login_normalizes_email(self):
        response = self.client.post(reverse("payments:login"), {"username": "CUSTOMER@EXAMPLE.COM", "password": "longpassword-example-123"})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.customer.pk)

    def test_new_open_play_session_cannot_overwrite_existing_court_hold(self):
        from .admin import PlayForm
        booking = self.reserve()
        form = PlayForm(data={"court": self.court.pk, "name": "Overlapping event", "starts_at": booking.starts_at,
            "ends_at": booking.ends_at, "capacity": 12, "amount": 15000, "active": True})
        self.assertFalse(form.is_valid())
        self.assertIn("held or booked", str(form.errors))

    def test_public_reservation_http_rejects_client_price_and_status(self):
        self.client.force_login(self.customer)
        response = self.client.post(reverse("payments:book"), {"court_id": self.court.pk,
            "date": (timezone.localdate() + timedelta(days=2)).isoformat(), "start_hour": "10", "hours": "2",
            "request_key": uuid.uuid4(), "amount": "1", "status": "confirmed"}, HTTP_ACCEPT="application/json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["amount"], 80000)
        self.assertEqual(response.json()["status"], "awaiting_payment")

    def test_configured_destination_and_staff_role_are_required(self):
        PaymentDestination.objects.update(active=False)
        with self.assertRaises(ValidationError):
            self.reserve()
        PaymentDestination.objects.update(active=True)
        booking = self.pending()
        self.other.is_staff = True
        self.other.save()
        with self.assertRaises(PermissionDenied):
            services.review(self.other, booking.pk, "confirm", "Checked", "BANK-1")


    def test_existing_receipt_route_preserves_private_pdf_access_after_api_removal(self):
        from staff_api.models import BookingRecord, Proof
        booking = self.pending()
        record = BookingRecord.objects.create(booking=booking)
        content = b"%PDF-1.4\nTest-only stored proof\n%%EOF"
        Proof.objects.create(record=record, name="original.pdf", mime="application/pdf", content=content)
        self.client.force_login(self.other)
        url = reverse("payments:receipt", args=[booking.pk])
        self.assertEqual(self.client.get(url).status_code, 404)
        self.client.force_login(self.admin)
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, content)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response["Content-Disposition"].startswith("attachment"))
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")


class AllocationConcurrencyTests(TransactionTestCase):
    def setUp(self):
        if connection.settings_dict["NAME"].startswith("file:memory"):
            self.skipTest("Set PAYMENTS_TEST_DB_PATH to a disposable file to exercise SQLite lock waiting.")
        self.court = Court.objects.create(name="Pickleball", sport="pickleball")
        self.users = [get_user_model().objects.create_user(f"player{index}", f"player{index}@example.com") for index in range(2)]
        PaymentDestination.objects.create(label="Owner QR", payee="Owner", account="123", qr_data=picture(), active=True)

    def race(self, session_id=None):
        barrier = Barrier(2)
        date = (timezone.localdate() + timedelta(days=2)).isoformat()

        def attempt(user_id):
            close_old_connections()
            try:
                user = get_user_model().objects.get(pk=user_id)
                barrier.wait(timeout=10)
                try:
                    services.reserve(user, court_id=self.court.pk, date=date, start_hour=10, hours=1,
                        session_id=session_id, request_key=uuid.uuid4())
                    return "reserved"
                except ValidationError:
                    return "unavailable"
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, [user.pk for user in self.users]))
        self.assertCountEqual(results, ["reserved", "unavailable"])
        self.assertEqual(Booking.objects.count(), 1)

    def test_two_customers_cannot_reserve_same_hour(self):
        self.race()

    def test_two_customers_cannot_take_last_open_play_seat(self):
        starts = timezone.now() + timedelta(days=2)
        session = PlaySession.objects.create(court=self.court, name="Last place", starts_at=starts,
            ends_at=starts + timedelta(hours=2), capacity=1, amount=15000)
        self.race(session.pk)
