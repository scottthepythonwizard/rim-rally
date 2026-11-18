import uuid
from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.http import HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.utils import timezone
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods, require_GET, require_POST
from .forms import SignupForm, ReceiptForm, ReservationForm
from .models import Booking, Receipt, PlaySession
from django.views.decorators.cache import never_cache
from . import services


def wants_json(request):
    return "application/json" in request.headers.get("Accept", "")


def booking_data(booking):
    return {"id": str(booking.id), "status": booking.status, "amount": booking.amount, "currency": "PHP",
        "court": booking.court.name, "type": "open-play" if booking.play_session_id else "court",
        "startsAt": booking.starts_at.isoformat(), "endsAt": booking.ends_at.isoformat(),
        "expiresAt": booking.expires_at.isoformat(), "serverNow": timezone.now().isoformat(),
        "paymentUrl": reverse("payments:detail", args=[booking.id]),
        "receiptSubmitted": Receipt.objects.filter(booking=booking).exists()}


@require_http_methods(["GET", "POST"])
@never_cache
def signup(request):
    form = SignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        target = request.GET.get("next", "")
        return redirect(target if url_has_allowed_host_and_scheme(target, allowed_hosts={request.get_host()}, require_https=request.is_secure()) else "payments:book")
    return render(request, "payments/form.html", {"form": form, "title": "Create customer account", "button": "Sign up"})


@require_http_methods(["GET", "POST"])
@never_cache
def book(request):
    services.expire_bookings()
    form = ReservationForm(request.POST if request.method == "POST" else None, initial={"request_key": uuid.uuid4(), "hours": 1})
    if request.method == "POST":
        if not request.user.is_authenticated:
            if wants_json(request):
                return JsonResponse({"error": {"code": "LOGIN_REQUIRED"}, "loginUrl": "/payments/login/?next=/payments/book/"}, status=401)
            return redirect("/payments/login/?next=/payments/book/")
        if form.is_valid():
            data = form.cleaned_data
            try:
                booking = services.reserve(request.user, court_id=data["court_id"].pk,
                    date=data["date"].isoformat() if data.get("date") else None,
                    start_hour=data.get("start_hour"), hours=data.get("hours"),
                    session_id=data["session_id"].pk if data.get("session_id") else None, request_key=data["request_key"])
                if wants_json(request):
                    return JsonResponse(booking_data(booking), status=201)
                return redirect("payments:detail", booking_id=booking.id)
            except ValidationError as error:
                form.add_error(None, error)
        if wants_json(request):
            return JsonResponse({"error": {"code": "RESERVATION_REJECTED", "fields": form.errors.get_json_data()}}, status=409)
    return render(request, "payments/book.html", {"form": form,
        "sessions": PlaySession.objects.filter(active=True, starts_at__gt=timezone.now()).select_related("court").order_by("starts_at")})


@login_required
@require_GET
@never_cache
def mine(request):
    services.expire_bookings()
    bookings = Booking.objects.filter(customer=request.user).select_related("court").order_by("-created_at")[:100]
    if wants_json(request):
        return JsonResponse({"bookings": [booking_data(booking) for booking in bookings]})
    return render(request, "payments/mine.html", {"bookings": bookings})


@login_required
@require_http_methods(["GET", "POST"])
@never_cache
def detail(request, booking_id):
    services.expire_bookings()
    booking = get_object_or_404(Booking.objects.select_related("court", "play_session"), pk=booking_id, customer=request.user)
    form = ReceiptForm(request.POST if request.method == "POST" else None, request.FILES if request.method == "POST" else None)
    if request.method == "POST":
        if form.is_valid():
            try:
                booking = services.upload_receipt(request.user, booking.id, form.cleaned_data["proof"], form.cleaned_data["reference"])
                if wants_json(request):
                    return JsonResponse(booking_data(booking))
                messages.success(request, "Receipt submitted. The owner must verify your transfer before this booking is confirmed.")
                return redirect("payments:detail", booking_id=booking.id)
            except ValidationError as error:
                form.add_error(None, error)
        if wants_json(request):
            return JsonResponse({"error": {"code": "RECEIPT_REJECTED", "fields": form.errors.get_json_data()}}, status=409)
    if request.method == "GET" and wants_json(request):
        return JsonResponse(booking_data(booking))
    return render(request, "payments/detail.html", {"booking": booking, "form": form})


def private_png(data):
    response = HttpResponse(bytes(data), content_type="image/png")
    response["Cache-Control"] = "private, no-store"
    response["Content-Disposition"] = 'inline; filename="payment-image.png"'
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


@login_required
@require_GET
def qr(request, booking_id):
    booking = get_object_or_404(Booking, pk=booking_id, customer=request.user)
    return private_png(booking.qr_data)


@login_required
@require_GET
def receipt(request, booking_id):
    query = Receipt.objects.select_related("booking")
    if not (request.user.is_staff and request.user.has_perm("payments.view_booking")):
        query = query.filter(booking__customer=request.user)
    return private_png(get_object_or_404(query, booking_id=booking_id).image)


@login_required
@require_POST
def cancel(request, booking_id):
    get_object_or_404(Booking, pk=booking_id, customer=request.user)
    try:
        services.cancel(request.user, booking_id)
    except ValidationError as error:
        if wants_json(request):
            return JsonResponse({"error": {"code": "CANNOT_CANCEL", "message": error.messages[0]}}, status=409)
        messages.error(request, error.messages[0])
    return redirect("payments:detail", booking_id=booking_id)


@require_GET
def session(request):
    response = JsonResponse({"authenticated": request.user.is_authenticated, "csrfToken": get_token(request)})
    response["Cache-Control"] = "private, no-store"
    return response
