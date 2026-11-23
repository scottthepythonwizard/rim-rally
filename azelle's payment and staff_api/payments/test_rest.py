"""DRF adapter tests without a second URL configuration or project settings module."""
from datetime import timedelta
import uuid
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from .models import Booking, Court, PaymentDestination, ConfirmationEmail
from .tests import picture
from .rest_api import CatalogueAPIView, BookingCollectionAPIView, BookingDetailAPIView, ReceiptUploadAPIView, CancelBookingAPIView, ReviewBookingAPIView, ReviewQueueAPIView, PaymentQRAPIView, ReceiptImageAPIView


class PaymentRESTTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.customer = get_user_model().objects.create_user("customer", "customer@example.com")
        cls.other = get_user_model().objects.create_user("other", "other@example.com")
        cls.owner = get_user_model().objects.create_superuser("owner", "owner@example.com", "test-only-password-123")
        cls.court = Court.objects.create(name="Basketball", sport="basketball")
        PaymentDestination.objects.create(label="Owner QR", payee="Owner", account="123", qr_data=picture(), active=True)

    def request(self, view, method="get", data=None, user=None, pk=None, format="json"):
        factory = APIRequestFactory()
        path = "/existing-team-route/"
        request = getattr(factory, method)(path, data=data, format=format)
        if user is not None:
            force_authenticate(request, user=user)
        return view.as_view()(request, **({"pk": pk} if pk is not None else {}))

    def reservation_input(self, **overrides):
        result = {"court_id": self.court.pk, "date": (timezone.localdate() + timedelta(days=2)).isoformat(),
            "start_hour": 10, "hours": 1, "request_key": str(uuid.uuid4())}
        result.update(overrides)
        return result

    def reserve(self):
        response = self.request(BookingCollectionAPIView, "post", self.reservation_input(), self.customer)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def submit(self, pk):
        return self.request(ReceiptUploadAPIView, "post", {"proof": SimpleUploadedFile("proof.png", picture(), content_type="image/png"), "reference": "CUSTOMER-REF"}, self.customer, pk, format="multipart")

    def test_public_catalogue_and_authenticated_creation(self):
        public = self.request(CatalogueAPIView)
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["courts"][0]["hourly_amount"], 40000)
        anonymous = self.request(BookingCollectionAPIView, "post", self.reservation_input())
        self.assertIn(anonymous.status_code, [401, 403])
        self.assertFalse(Booking.objects.exists())

    def test_server_price_readonly_state_and_input_validation(self):
        rejected = self.request(BookingCollectionAPIView, "post", self.reservation_input(amount=1, status="confirmed"), self.customer)
        self.assertEqual(rejected.status_code, 400)
        self.assertFalse(Booking.objects.exists())
        invalid = self.request(BookingCollectionAPIView, "post", self.reservation_input(hours=0), self.customer)
        self.assertEqual(invalid.status_code, 400)
        response = self.request(BookingCollectionAPIView, "post", self.reservation_input(hours=2), self.customer)
        self.assertEqual(response.data["amount"], 80000)
        self.assertEqual(response.data["status"], "awaiting_payment")
        self.assertNotIn("qr_data", response.data)
        self.assertNotIn("customer_email", response.data)

    def test_json_pending_staff_review_and_confirmation(self):
        pk = self.reserve()
        pending = self.submit(pk)
        self.assertEqual(pending.status_code, 200, pending.data)
        self.assertEqual(pending.data["status"], "pending_verification")
        self.assertFalse(ConfirmationEmail.objects.exists())
        decision = {"decision": "confirm", "bank_reference": "BANK-100", "note": "Checked transfer in actual wallet", "checked": True}
        denied = self.request(ReviewBookingAPIView, "post", decision, self.customer, pk)
        self.assertEqual(denied.status_code, 403)
        queue = self.request(ReviewQueueAPIView, user=self.owner)
        self.assertEqual(queue.data["results"][0]["customer_email"], self.customer.email)
        confirmed = self.request(ReviewBookingAPIView, "post", decision, self.owner, pk)
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(confirmed.data["status"], "confirmed")
        self.assertEqual(ConfirmationEmail.objects.count(), 1)
        self.request(ReviewBookingAPIView, "post", decision, self.owner, pk)
        self.assertEqual(ConfirmationEmail.objects.count(), 1)

    def test_customer_and_receipt_ownership(self):
        pk = self.reserve()
        self.submit(pk)
        for view in [BookingDetailAPIView, PaymentQRAPIView, ReceiptImageAPIView]:
            self.assertEqual(self.request(view, user=self.other, pk=pk).status_code, 404)
        image = self.request(ReceiptImageAPIView, user=self.customer, pk=pk)
        self.assertEqual(image.status_code, 200)
        self.assertEqual(image["Content-Type"], "image/png")
        self.assertIn("no-store", image["Cache-Control"])
        self.assertEqual(self.request(ReceiptImageAPIView, user=self.owner, pk=pk).status_code, 200)
        self.assertEqual(self.request(ReviewQueueAPIView, user=self.customer).status_code, 403)

    def test_bad_proof_and_wrong_content_type_rejected(self):
        pk = self.reserve()
        malformed = self.request(ReceiptUploadAPIView, "post", {"proof": SimpleUploadedFile("fake.png", b"not an image"), "reference": "REF"}, self.customer, pk, format="multipart")
        self.assertEqual(malformed.status_code, 400)
        wrong_type = self.request(ReceiptUploadAPIView, "post", {"proof": "fake", "reference": "REF"}, self.customer, pk)
        self.assertEqual(wrong_type.status_code, 415)
        self.assertEqual(Booking.objects.get(pk=pk).status, "awaiting_payment")

    def test_conflict_expiry_and_rebooking(self):
        pk = self.reserve()
        conflict = self.request(BookingCollectionAPIView, "post", self.reservation_input(), self.other)
        self.assertEqual(conflict.status_code, 409)
        Booking.objects.filter(pk=pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        status = self.request(BookingDetailAPIView, user=self.customer, pk=pk)
        self.assertEqual(status.data["status"], "expired")
        self.assertEqual(self.submit(pk).status_code, 409)
        self.assertEqual(self.request(BookingCollectionAPIView, "post", self.reservation_input(), self.other).status_code, 201)

    def test_idempotency_and_cancel(self):
        data = self.reservation_input()
        first = self.request(BookingCollectionAPIView, "post", data, self.customer)
        again = self.request(BookingCollectionAPIView, "post", data, self.customer)
        self.assertEqual(first.data["id"], again.data["id"])
        self.assertEqual(Booking.objects.count(), 1)
        cancelled = self.request(CancelBookingAPIView, "post", {}, self.customer, first.data["id"])
        self.assertEqual(cancelled.data["status"], "cancelled")

    def test_review_requires_explicit_verification_and_reference(self):
        pk = self.reserve()
        self.submit(pk)
        incomplete = self.request(ReviewBookingAPIView, "post", {"decision": "confirm", "note": "Checked", "checked": False}, self.owner, pk)
        self.assertEqual(incomplete.status_code, 400)
        missing_reference = self.request(ReviewBookingAPIView, "post", {"decision": "confirm", "note": "Checked", "checked": True}, self.owner, pk)
        self.assertEqual(missing_reference.status_code, 400)
        self.assertEqual(Booking.objects.get(pk=pk).status, "pending_verification")

    def test_paginated_customer_list_and_queue_status_validation(self):
        self.reserve()
        self.assertEqual(self.request(BookingCollectionAPIView, user=self.other).data["count"], 0)
        mine = self.request(BookingCollectionAPIView, user=self.customer)
        self.assertEqual(mine.data["count"], 1)
        self.assertIn("results", mine.data)
        bad_filter = self.request(ReviewQueueAPIView, data={"status": "invalid"}, user=self.owner)
        self.assertEqual(bad_filter.status_code, 400)

    def test_session_authentication_keeps_csrf_checks(self):
        request = APIRequestFactory(enforce_csrf_checks=True).post("/existing-team-route/", self.reservation_input(), format="json")
        request.user = self.customer
        response = BookingCollectionAPIView.as_view()(request)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Booking.objects.exists())

    def test_malformed_json_is_a_drf_error(self):
        request = APIRequestFactory().post("/existing-team-route/", '{"broken"', content_type="application/json")
        force_authenticate(request, user=self.customer)
        response = BookingCollectionAPIView.as_view()(request)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Booking.objects.exists())
