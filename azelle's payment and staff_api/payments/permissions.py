from rest_framework.permissions import BasePermission


class CanViewPayments(BasePermission):
    message = "Payment staff access is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff and user.has_perm("payments.view_booking"))


class CanReviewPayments(BasePermission):
    message = "Payment review permission is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and user.is_staff and user.has_perm("payments.change_booking"))
