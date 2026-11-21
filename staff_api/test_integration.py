"""HTTP contracts for the frontend, using disposable Django test databases."""
import uuid
from datetime import timedelta
from django.test import Client, TestCase, TransactionTestCase
from django.db import close_old_connections, connection
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from unittest.mock import patch
from django.utils import timezone
from payments.models import Court
from payments.models import PaymentDestination
from django.contrib.auth import get_user_model
from io import BytesIO
from PIL import Image
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from pathlib import Path
import hashlib


class FrontendIntegrationTests(TestCase):
    def test_staff_can_upload_for_a_native_rest_booking(self):
        court = Court.objects.create(name="Native booking court", sport="basketball")
        buffer = BytesIO()
        Image.new("RGB", (20, 20), "red").save(buffer, format="PNG")
        PaymentDestination.objects.create(label="Test", payee="Test", account="TEST", qr_data=buffer.getvalue(), active=True)
        user = get_user_model().objects.create_user("native-customer", "native@example.test", "test-only-password")
        owner = get_user_model().objects.create_superuser("owner", "owner@example.test", "test-only-password")
        self.client.force_login(user)
        booking = self.client.post("/api/payments/bookings/", {"court_id": court.pk, "request_key": str(uuid.uuid4()), "date": (timezone.localdate() + timedelta(days=2)).isoformat(), "start_hour": 10, "hours": 1}, content_type="application/json")
        self.assertEqual(booking.status_code, 201, booking.content)
        self.client.force_login(owner)
        proof = self.client.post(f"/api/staff/payments/{booking.json()['id']}/proof", {"proof": SimpleUploadedFile("proof.png", buffer.getvalue()), "reference": "TEST-NATIVE"})
        self.assertEqual(proof.status_code, 200, proof.content)

    def test_expired_frontend_hold_releases_availability_and_cannot_start_payment(self):
        court = Court.objects.create(name="Expiry court", sport="pickleball", hourly_amount=40000)
        now = timezone.now()
        day = (timezone.localdate() + timedelta(days=2)).isoformat()
        query = {"facilityId": "rim-and-rally", "sport": "pickleball", "date": day, "mode": "court"}
        headers = {"HTTP_X_GUEST_RECOVERY": "test-only-expiry-credential-123456", "HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
        hold = self.client.post("/api/holds", {**query, "slotIds": [f"{day}_court-{court.pk}_8"]}, content_type="application/json", **headers).json()
        with patch("django.utils.timezone.now", return_value=now + timedelta(minutes=11)):
            self.assertEqual(self.client.get("/api/holds/" + hold["id"], **headers).status_code, 410)
            self.assertEqual(self.client.get("/api/availability", query).json()["courts"][0]["slots"][0]["status"], "available")
            self.assertEqual(self.client.post("/api/payment-attempts", {"holdId": hold["id"], "holdRevision": 1, "expectedAmount": 40000}, content_type="application/json", **headers).status_code, 410)

    def test_failed_logins_keep_their_rate_limit(self):
        fields = {"email": "missing@example.test", "password": "test-only-invalid-password"}
        for _ in range(10):
            self.assertEqual(self.client.post("/api/auth/login", fields, content_type="application/json").status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", fields, content_type="application/json").status_code, 429)

    def test_host_uses_the_reviewed_payment_core_implementation(self):
        core = Path(settings.BASE_DIR).parent / "payment-core" / "payments"
        if not core.exists():
            self.skipTest("Source package comparison applies only to the two local checkouts.")
        for name in ["services.py", "models.py", "images.py", "serializers.py", "permissions.py", "rest_api.py"]:
            self.assertEqual(hashlib.sha256((core / name).read_bytes()).digest(), hashlib.sha256((Path(settings.BASE_DIR) / "payments" / name).read_bytes()).digest(), name)

    def test_guest_checkout_requires_real_instructions_and_receipt_reference(self):
        court = Court.objects.create(name="Checkout court", sport="pickleball", hourly_amount=47500)
        buffer = BytesIO()
        Image.new("RGB", (20, 20), "white").save(buffer, format="PNG")
        PaymentDestination.objects.create(label="Test only", payee="Test owner", account="TEST", qr_data=buffer.getvalue(), active=True)
        # Contact details must not grant access to this existing customer's account.
        existing = get_user_model().objects.create_user("existing", "guest@example.test", "test-only-password")
        day = (timezone.localdate() + timedelta(days=2)).isoformat()
        query = {"facilityId": "rim-and-rally", "sport": "pickleball", "date": day, "mode": "court"}
        slot = self.client.get("/api/availability", query).json()["courts"][0]["slots"][0]
        headers = {"HTTP_X_GUEST_RECOVERY": "test-only-guest-credential-123456", "HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
        hold = self.client.post("/api/holds", {**query, "slotIds": [slot["id"]]}, content_type="application/json", **headers).json()
        headers["HTTP_IDEMPOTENCY_KEY"] = str(uuid.uuid4())
        payload = {"holdId": hold["id"], "holdRevision": hold["revision"], "expectedAmount": 47500, "method": "qrph",
            "guest": {"name": "Test guest", "email": existing.email, "mobile": "09171234567"}}
        result = self.client.post("/api/payment-attempts", payload, content_type="application/json", **headers)
        self.assertEqual(result.status_code, 201, result.content)
        attempt = result.json()
        self.assertEqual(attempt["status"], "pending")
        self.assertEqual(attempt["payee"], "Test owner")
        self.client.force_login(existing)
        self.assertEqual(self.client.get("/api/payments/bookings/").json()["count"], 0)
        self.client.logout()
        proof_url = f"/api/payment-attempts/{attempt['id']}/proof"
        invalid = self.client.post(proof_url, {"proof": SimpleUploadedFile("proof.png", buffer.getvalue())}, **headers)
        self.assertEqual(invalid.status_code, 422)
        valid = self.client.post(proof_url, {"proof": SimpleUploadedFile("proof.png", buffer.getvalue()), "reference": "TEST-TRANSFER"}, **headers)
        self.assertEqual(valid.status_code, 200, valid.content)
        self.assertEqual(self.client.get(f"/api/payment-attempts/{attempt['id']}", **headers).json()["proofStatus"], "submitted")
        owner = get_user_model().objects.create_superuser("owner", "owner@example.test", "test-only-owner-password")
        self.client.force_login(owner)
        details = self.client.get(f"/api/staff/bookings/{attempt['reservationId']}").json()
        proof_id = details["proofs"][0]["id"]
        review = {"outcome": "verified", "reason": "Checked test transfer", "bank_reference": "TEST-BANK-47"}
        url = f"/api/staff/proofs/{proof_id}/review"
        self.assertEqual(self.client.post(url, review, content_type="application/json").status_code, 422)
        review["checked"] = True
        self.assertEqual(self.client.post(url, review, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.post(url, review, content_type="application/json").status_code, 200)
        confirmed = self.client.get(f"/api/payment-attempts/{attempt['id']}", **headers).json()
        self.assertEqual(confirmed["bookingStatus"], "confirmed")
        receipt = self.client.get(f"/api/bookings/{confirmed['bookingId']}", **headers)
        self.assertEqual(receipt.status_code, 200, receipt.content)
        token = receipt.json()["ticketToken"]
        self.assertTrue(self.client.get(f"/api/staff/tickets/{token}").json()["valid"])
        self.assertEqual(self.client.get(f"/api/staff/tickets/{token}tampered").status_code, 404)
        booking_url = f"/api/staff/bookings/{confirmed['bookingId']}"
        self.assertEqual(self.client.post(booking_url + "/cancellation", {"reason": "Test cancellation"}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.post(booking_url + "/cancel", {"decision": "Test"}, content_type="application/json").status_code, 422)
        self.assertEqual(self.client.post(booking_url + "/cancel", {"decision": "Refund pending", "refund": "pending"}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.get(f"/api/staff/tickets/{token}").status_code, 404)
        self.assertEqual(self.client.post(booking_url + "/refund", {"decision": "TEST-REFUND"}, content_type="application/json").status_code, 200)

    def test_login_csrf_credentials_and_staff_authorization(self):
        get_user_model().objects.create_superuser("owner", "owner@example.test", "test-only-owner-password")
        browser = Client(enforce_csrf_checks=True)
        fields = {"email": "owner@example.test", "password": "test-only-owner-password"}
        self.assertEqual(browser.post("/api/auth/login", fields, content_type="application/json").status_code, 403)
        self.assertEqual(browser.get("/api/auth/csrf").status_code, 200)
        token = browser.cookies["rim_rally_csrf"].value
        headers = {"HTTP_X_CSRFTOKEN": token}
        self.assertEqual(browser.post("/api/auth/login", {**fields, "password": "incorrect"}, content_type="application/json", **headers).status_code, 401)
        self.assertEqual(browser.post("/api/auth/login", fields, content_type="application/json", **headers).status_code, 200)
        self.assertEqual(browser.get("/api/staff/me").json()["role"], "admin")
        token = browser.cookies["rim_rally_csrf"].value
        self.assertEqual(browser.post("/api/auth/logout", {}, content_type="application/json", HTTP_X_CSRFTOKEN=token).status_code, 200)
        self.assertEqual(browser.get("/api/staff/me").status_code, 401)


    def test_stored_availability_and_idempotent_guest_hold(self):
        Court.objects.create(name="Integration court", sport="pickleball", hourly_amount=47500)
        day = (timezone.localdate() + timedelta(days=2)).isoformat()
        query = {"facilityId": "rim-and-rally", "sport": "pickleball", "date": day}
        response = self.client.get("/api/availability", query)
        self.assertEqual(response.status_code, 200)
        slot = response.json()["courts"][0]["slots"][0]
        self.assertEqual(slot["amount"], 47500)
        body = {**query, "mode": "court", "slotIds": [slot["id"]]}
        headers = {"HTTP_X_GUEST_RECOVERY": "test-only-guest-credential-123456", "HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
        first = self.client.post("/api/holds", body, content_type="application/json", **headers)
        self.assertEqual(first.status_code, 201, first.content)
        again = self.client.post("/api/holds", body, content_type="application/json", **headers)
        self.assertEqual(again.status_code, 201, again.content)
        self.assertEqual(first.json()["id"], again.json()["id"])
        unavailable = self.client.get("/api/availability", query).json()["courts"][0]["slots"][0]
        self.assertEqual(unavailable["status"], "held")
        other = get_user_model().objects.create_user("other-customer", "other@example.test", "test-only-password")
        self.client.force_login(other)
        conflicting = self.client.post("/api/payments/bookings/", {"court_id": Court.objects.get().pk,
            "date": day, "start_hour": 8, "hours": 1, "request_key": str(uuid.uuid4())}, content_type="application/json")
        self.assertEqual(conflicting.status_code, 409, conflicting.content)

    def test_staff_walk_in_cash_cancellation_and_customer_reuse(self):
        court = Court.objects.create(name="Walk-in court", sport="pickleball", hourly_amount=40000)
        buffer = BytesIO()
        Image.new("RGB", (20, 20)).save(buffer, format="PNG")
        PaymentDestination.objects.create(label="Test", payee="Test owner", account="TEST", qr_data=buffer.getvalue(), active=True)
        owner = get_user_model().objects.create_superuser("owner", "owner@example.test", "test-only-password")
        self.client.force_login(owner)
        day = (timezone.localdate() + timedelta(days=2)).isoformat()
        headers = {"HTTP_IDEMPOTENCY_KEY": str(uuid.uuid4())}
        payload = {"facilityId": "rim-and-rally", "sport": "pickleball", "date": day, "mode": "court",
            "slotIds": [f"{day}_court-{court.pk}_8"], "method": "cash", "guest": {"name": "Walk-in guest", "email": "walkin@example.test", "mobile": "09171234567"}}
        first = self.client.post("/api/staff/walk-ins", payload, content_type="application/json", **headers)
        self.assertEqual(first.status_code, 200, first.content)
        second = self.client.post("/api/staff/walk-ins", payload, content_type="application/json", **headers)
        self.assertEqual(second.json()["bookingId"], first.json()["bookingId"])
        details = self.client.get("/api/staff/bookings/" + first.json()["bookingId"]).json()
        self.assertEqual(details["status"], "confirmed")
        self.assertEqual(details["payment_status"], "succeeded")
        self.assertEqual(len(self.client.get("/api/staff/customers").json()), 1)
        headers["HTTP_IDEMPOTENCY_KEY"] = str(uuid.uuid4())
        payload.update(slotIds=[f"{day}_court-{court.pk}_9"], method="unpaid")
        unpaid = self.client.post("/api/staff/walk-ins", payload, content_type="application/json", **headers)
        self.assertEqual(unpaid.status_code, 200, unpaid.content)
        cash_url = "/api/staff/bookings/" + unpaid.json()["bookingId"] + "/cash"
        self.assertEqual(self.client.post(cash_url, {}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.post(cash_url, {}, content_type="application/json").status_code, 200)
        self.assertEqual(len(self.client.get("/api/staff/customers").json()), 1)

    def test_schedule_invitations_and_permissions_use_stored_data(self):
        Court.objects.create(name="Schedule court", sport="pickleball", hourly_amount=40000)
        owner = get_user_model().objects.create_superuser("owner", "owner@example.test", "test-only-password")
        self.client.force_login(owner)
        day = (timezone.localdate() + timedelta(days=2)).isoformat()
        schedule = {"name": "Integration open play", "sport": "pickleball", "court": "Schedule court", "date": day, "start": "10:00", "end": "12:00", "capacity": "1", "price": "150.00"}
        self.assertEqual(self.client.post("/api/staff/schedules", schedule, content_type="application/json").status_code, 200)
        saved = self.client.get("/api/staff/schedules").json()[0]
        self.assertEqual(self.client.get("/api/staff/sessions").json()[0]["remaining"], 1)
        self.assertEqual(self.client.post("/api/staff/schedules/change", {"id": saved["id"], "version": saved["version"], "operation": "delete"}, content_type="application/json").status_code, 200)
        self.assertEqual(self.client.get("/api/staff/schedules").json(), [])
        result = self.client.post("/api/staff/invitations", {"email": "new-staff@example.test", "role": "staff"}, content_type="application/json")
        self.assertIn("/join#", result.json()["invitation"])
        self.assertEqual(len(self.client.get("/api/staff/invitations").json()), 1)
        self.client.logout()
        browser = Client(enforce_csrf_checks=True)
        browser.get("/api/auth/csrf")
        token = browser.cookies["rim_rally_csrf"].value
        joined = browser.post("/api/auth/join", {"invitation": result.json()["invitation"].split("#")[1], "password": "New-staff-test-only!9331"}, content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(joined.status_code, 200, joined.content)
        logged = browser.post("/api/auth/login", {"email": "new-staff@example.test", "password": "New-staff-test-only!9331"}, content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(logged.status_code, 200, logged.content)
        self.assertEqual(browser.get("/api/staff/accounts").status_code, 403)


class ConcurrentFrontendHoldTests(TransactionTestCase):
    def test_simultaneous_guests_cannot_hold_the_same_court_hour(self):
        if str(connection.settings_dict["NAME"]).startswith("file:memory"):
            self.skipTest("Set PAYMENTS_TEST_DB_PATH to a disposable file for the concurrency check.")
        court = Court.objects.create(name="Concurrent court", sport="pickleball", hourly_amount=40000)
        day = (timezone.localdate() + timedelta(days=2)).isoformat()
        body = {"facilityId": "rim-and-rally", "sport": "pickleball", "mode": "court", "date": day, "slotIds": [f"{day}_court-{court.pk}_8"]}
        barrier = Barrier(2)
        def attempt(index):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                response = Client().post("/api/holds", body, content_type="application/json", HTTP_X_GUEST_RECOVERY=f"test-only-concurrent-guest-{index}", HTTP_IDEMPOTENCY_KEY=str(uuid.uuid4()))
                return response.status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as pool:
            statuses = list(pool.map(attempt, [1, 2]))
        self.assertCountEqual(statuses, [201, 409])
