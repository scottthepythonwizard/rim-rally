from django import forms
from django.contrib import admin, messages
from django.core.exceptions import ValidationError
from datetime import timedelta
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils import timezone
from .models import Court, PlaySession, PaymentDestination, Booking, Receipt, Review, ConfirmationEmail
from .forms import ReviewForm
from .images import clean_image
from . import services


class DestinationForm(forms.ModelForm):
    qr_upload = forms.FileField(required=False, help_text="Owner's actual payment QR, PNG or JPEG, up to 5 MB.")

    class Meta:
        model = PaymentDestination
        fields = ["label", "payee", "account", "active"]

    def clean_qr_upload(self):
        upload = self.cleaned_data.get("qr_upload")
        if upload:
            return clean_image(upload)
        if not self.instance.pk:
            raise forms.ValidationError("Upload the owner's payment QR.")
        return None


@admin.register(PaymentDestination)
class DestinationAdmin(admin.ModelAdmin):
    form = DestinationForm
    list_display = ["label", "payee", "account", "active"]

    def save_model(self, request, obj, form, change):
        if form.cleaned_data.get("qr_upload"):
            obj.qr_data = form.cleaned_data["qr_upload"]
        super().save_model(request, obj, form, change)


@admin.register(Court)
class CourtAdmin(admin.ModelAdmin):
    list_display = ["name", "sport", "hourly_amount", "active"]


class PlayForm(forms.ModelForm):
    class Meta:
        model = PlaySession
        fields = "__all__"

    def clean(self):
        data = super().clean()
        court, starts, ends = data.get("court"), data.get("starts_at"), data.get("ends_at")
        if not all([court, starts, ends]):
            return data
        # Admin changeform runs in an atomic transaction. Serialize against new holds.
        Court.objects.select_for_update().get(pk=court.pk)
        if self.instance.pk and Booking.objects.filter(play_session=self.instance).exists() and self.changed_data:
            raise forms.ValidationError("A session with bookings cannot be edited. Arrange changes with customers first.")
        if ends <= starts:
            raise forms.ValidationError("End must be after start.")
        local_start, local_end = timezone.localtime(starts), timezone.localtime(ends)
        day_end = (local_start.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1))
        if local_start.hour < 8 or local_end > day_end:
            raise forms.ValidationError("Sessions must be between 8 AM and midnight in Asia/Manila.")
        if data.get("active"):
            if PlaySession.objects.filter(court=court, active=True, starts_at__lt=ends, ends_at__gt=starts).exclude(pk=self.instance.pk).exists():
                raise forms.ValidationError("Another Open Play session overlaps this court.")
            overlaps = services.active_bookings(timezone.now()).filter(court=court, starts_at__lt=ends, ends_at__gt=starts)
            if self.instance.pk:
                overlaps = overlaps.exclude(play_session_id=self.instance.pk)
            if overlaps.exists():
                raise forms.ValidationError("This court already has a held or booked reservation.")
        return data


@admin.register(PlaySession)
class PlayAdmin(admin.ModelAdmin):
    form = PlayForm
    list_display = ["name", "court", "starts_at", "ends_at", "capacity", "amount", "active"]


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ["id", "customer_email", "court", "starts_at", "amount", "status", "expires_at", "review_link"]
    list_filter = ["status", "court"]
    search_fields = ["id", "customer_email", "bank_reference"]
    readonly_fields = [field.name for field in Booking._meta.fields if field.name != "qr_data"] + ["proof_link", "review_link"]
    exclude = ["qr_data"]
    actions = None

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def get_queryset(self, request):
        services.expire_bookings()
        return super().get_queryset(request).select_related("court", "customer")

    @admin.display(description="Receipt")
    def proof_link(self, obj):
        if Receipt.objects.filter(booking=obj).exists():
            return format_html('<a href="{}" target="_blank" rel="noopener">View payment receipt</a>', reverse("payments:receipt", args=[obj.pk]))
        return "No receipt uploaded"

    @admin.display(description="Payment review")
    def review_link(self, obj):
        return format_html('<a href="{}">Review booking and transfer</a>', reverse("admin:payments_booking_review", args=[obj.pk]))

    def get_urls(self):
        return [path("<uuid:booking_id>/review/", self.admin_site.admin_view(self.review_view), name="payments_booking_review")] + super().get_urls()

    def review_view(self, request, booking_id):
        if not self.has_change_permission(request):
            from django.core.exceptions import PermissionDenied
            raise PermissionDenied()
        services.expire_bookings()
        booking = get_object_or_404(Booking.objects.select_related("court", "play_session"), pk=booking_id)
        form = ReviewForm(request.POST if request.method == "POST" else None)
        if request.method == "POST" and form.is_valid():
            try:
                services.review(request.user, booking.id, form.cleaned_data["decision"], form.cleaned_data["note"], form.cleaned_data["bank_reference"])
                messages.success(request, "Review saved. Confirmed bookings have a queued confirmation email.")
                return redirect("admin:payments_booking_changelist")
            except ValidationError as error:
                form.add_error(None, error)
        return render(request, "admin/payments/review.html", {**self.admin_site.each_context(request), "title": "Verify payment", "booking": booking, "form": form, "proof_link": self.proof_link(booking)})


class AuditAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Review)
class ReviewAdmin(AuditAdmin):
    list_display = ["booking", "reviewer", "decision", "created_at"]


@admin.register(ConfirmationEmail)
class EmailAdmin(AuditAdmin):
    list_display = ["booking", "recipient", "sent_at", "attempts", "next_attempt_at"]
