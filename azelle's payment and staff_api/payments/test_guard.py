"""Host allocation rules must protect the original REST interface too."""
import uuid
from datetime import timedelta
from django.core.exceptions import ValidationError
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from payments.models import Court, PaymentDestination
from payments.tests import picture
from payments.rest_api import BookingCollectionAPIView


def held_by_another_customer(*args):
    raise ValidationError("This court time is held by another customer.")


class HostAllocationTests(TestCase):
    @override_settings(PAYMENT_ALLOCATION_GUARD="payments.test_guard.held_by_another_customer")
    def test_host_hold_conflict_is_returned_by_the_original_rest_endpoint(self):
        court = Court.objects.create(name="Test court", sport="basketball")
        PaymentDestination.objects.create(label="Test", payee="Test owner", account="TEST", qr_data=picture(), active=True)
        user = get_user_model().objects.create_user("test-customer", "test@example.test")
        request = APIRequestFactory().post("/api/payments/bookings/", {"court_id": court.pk,
            "request_key": str(uuid.uuid4()), "date": (timezone.localdate() + timedelta(days=2)).isoformat(), "start_hour": 10, "hours": 1}, format="json")
        force_authenticate(request, user=user)
        response = BookingCollectionAPIView.as_view()(request)
        self.assertEqual(response.status_code, 409)
        self.assertIn("held by another", str(response.data["detail"]))
