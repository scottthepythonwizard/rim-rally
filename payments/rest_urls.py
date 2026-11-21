"""Preserve payment-core's documented DRF interface alongside the frontend adapter."""
from django.urls import path
from . import rest_api as api
urlpatterns = [
    path("catalogue/", api.CatalogueAPIView.as_view()),
    path("bookings/", api.BookingCollectionAPIView.as_view()),
    path("bookings/<uuid:pk>/", api.BookingDetailAPIView.as_view()),
    path("bookings/<uuid:pk>/receipt/", api.ReceiptUploadAPIView.as_view()),
    path("bookings/<uuid:pk>/cancel/", api.CancelBookingAPIView.as_view()),
    path("bookings/<uuid:pk>/qr/", api.PaymentQRAPIView.as_view()),
    path("bookings/<uuid:pk>/receipt-image/", api.ReceiptImageAPIView.as_view()),
    path("bookings/<uuid:pk>/review/", api.ReviewBookingAPIView.as_view()),
    path("review-queue/", api.ReviewQueueAPIView.as_view()),
]
