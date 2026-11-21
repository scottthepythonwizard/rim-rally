from django.urls import path
from .api import AuthAPIView, GuestAPIView, StaffAPIView

urlpatterns = []
for operation in ("csrf", "login", "logout", "join"):
    urlpatterns.append(path("auth/" + operation, AuthAPIView.as_view(), {"operation": operation}))
for operation in ("availability", "open-play", "holds"):
    urlpatterns.append(path(operation, GuestAPIView.as_view(), {"operation": operation}))
urlpatterns += [
    path("holds/<str:identifier>", GuestAPIView.as_view(), {"operation": "holds"}),
    path("payment-attempts", GuestAPIView.as_view(), {"operation": "payments"}),
    path("payment-attempts/by-key/<str:identifier>", GuestAPIView.as_view(), {"operation": "by-key"}),
    path("payment-attempts/<str:identifier>/proof", GuestAPIView.as_view(), {"operation": "proof"}),
    path("payment-attempts/<str:identifier>/qr", GuestAPIView.as_view(), {"operation": "qr"}),
    path("payment-attempts/<str:identifier>", GuestAPIView.as_view(), {"operation": "payments"}),
    path("bookings/<str:identifier>/cancellations", GuestAPIView.as_view(), {"operation": "cancellations"}),
    path("bookings/<str:identifier>", GuestAPIView.as_view(), {"operation": "bookings"}),
]
for operation in ("me", "bookings", "customers", "schedules", "sessions", "cancellations", "courts", "accounts", "invitations", "walk-ins"):
    urlpatterns.append(path("staff/" + operation, StaffAPIView.as_view(), {"operation": operation}))
for operation in ("bookings", "customers", "schedules", "proofs"):
    urlpatterns.append(path("staff/" + operation + "/<str:identifier>", StaffAPIView.as_view(), {"operation": operation}))
# Specific mutations precede dynamic detail routes where their paths overlap.
urlpatterns = [
    path("staff/accounts/update", StaffAPIView.as_view(), {"operation": "accounts"}),
    path("staff/invitations/revoke", StaffAPIView.as_view(), {"operation": "revoke"}),
    path("staff/schedules/change", StaffAPIView.as_view(), {"operation": "schedule-change"}),
    path("staff/payments/<str:identifier>/proof", StaffAPIView.as_view(), {"operation": "upload"}),
    path("staff/proofs/<str:identifier>/review", StaffAPIView.as_view(), {"operation": "review"}),
    path("staff/tickets/<str:identifier>", StaffAPIView.as_view(), {"operation": "verify"}),
] + urlpatterns
for operation in ("cancellation", "cancel", "refund", "cash"):
    urlpatterns.append(path("staff/bookings/<str:identifier>/" + operation, StaffAPIView.as_view(), {"operation": operation}))
