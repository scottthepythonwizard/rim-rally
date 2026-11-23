"""DRF handlers to import or merge into your team's existing views and URL configuration."""
from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser, FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework.views import APIView
from . import services
from .models import Booking, Court, PlaySession, Receipt
from .permissions import CanViewPayments, CanReviewPayments
from .serializers import ReservationSerializer, ReceiptUploadSerializer, PaymentReviewSerializer, BookingSerializer, StaffBookingSerializer, CourtSerializer, PlaySessionSerializer


class PaymentConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "The booking or payment state changed."
    default_code = "payment_conflict"


class PaymentPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class PaymentAPIView(APIView):
    # Authentication/throttling inherit the team's DRF project settings.
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def handle_exception(self, exc):
        if isinstance(exc, DjangoValidationError):
            exc = PaymentConflict({"detail": " ".join(exc.messages)})
        return super().handle_exception(exc)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def owned_booking(self, request, pk):
        services.expire_bookings()
        return get_object_or_404(Booking.objects.select_related("court"), pk=pk, customer=request.user)

    def paginated(self, request, queryset, serializer):
        pagination = PaymentPagination()
        page = pagination.paginate_queryset(queryset, request, view=self)
        return pagination.get_paginated_response(serializer(page, many=True).data)


class CatalogueAPIView(PaymentAPIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"currency": "PHP", "server_now": timezone.now(),
            "courts": CourtSerializer(Court.objects.filter(active=True).order_by("pk"), many=True).data,
            "sessions": PlaySessionSerializer(PlaySession.objects.filter(active=True, court__active=True, starts_at__gt=timezone.now()).order_by("starts_at")[:100], many=True).data})


class BookingCollectionAPIView(PaymentAPIView):
    def get(self, request):
        services.expire_bookings()
        rows = Booking.objects.filter(customer=request.user).select_related("court").order_by("-created_at", "pk")
        return self.paginated(request, rows, BookingSerializer)

    def post(self, request):
        serializer = ReservationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        booking = services.reserve(request.user, **serializer.validated_data)
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)


class BookingDetailAPIView(PaymentAPIView):
    def get(self, request, pk):
        return Response(BookingSerializer(self.owned_booking(request, pk)).data)


class ReceiptUploadAPIView(PaymentAPIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        self.owned_booking(request, pk)
        serializer = ReceiptUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        booking = services.upload_receipt(request.user, pk, fields["proof"], fields["reference"])
        return Response(BookingSerializer(booking).data)


class CancelBookingAPIView(PaymentAPIView):
    def post(self, request, pk):
        self.owned_booking(request, pk)
        services.cancel(request.user, pk)
        return Response(BookingSerializer(self.owned_booking(request, pk)).data)


class ReviewQueueAPIView(PaymentAPIView):
    permission_classes = [IsAuthenticated, CanViewPayments]

    def get(self, request):
        services.expire_bookings()
        booking_status = request.query_params.get("status", Booking.Status.PENDING)
        if booking_status not in Booking.Status.values:
            raise ValidationError({"status": "Choose a valid booking status."})
        rows = Booking.objects.filter(status=booking_status).select_related("court").order_by("created_at", "pk")
        return self.paginated(request, rows, StaffBookingSerializer)


class ReviewBookingAPIView(PaymentAPIView):
    permission_classes = [IsAuthenticated, CanReviewPayments]

    def post(self, request, pk):
        get_object_or_404(Booking, pk=pk)
        serializer = PaymentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = serializer.validated_data
        booking = services.review(request.user, pk, fields["decision"], fields["note"], fields["bank_reference"])
        return Response(StaffBookingSerializer(booking).data)


def private_image(data):
    response = HttpResponse(bytes(data), content_type="image/png")
    response["Content-Disposition"] = 'inline; filename="payment-image.png"'
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


class PaymentQRAPIView(PaymentAPIView):
    def get(self, request, pk):
        return private_image(self.owned_booking(request, pk).qr_data)


class ReceiptImageAPIView(PaymentAPIView):
    def get(self, request, pk):
        receipts = Receipt.objects.select_related("booking")
        staff = CanViewPayments().has_permission(request, self)
        if not staff:
            receipts = receipts.filter(booking__customer=request.user)
        return private_image(get_object_or_404(receipts, booking_id=pk).image)
