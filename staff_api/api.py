"""The frontend contract lives here; payment models and services stay canonical."""
from django.conf import settings
from django.contrib.auth import get_user_model, logout
from django.core.exceptions import ObjectDoesNotExist, ValidationError, PermissionDenied
from django.db import transaction, IntegrityError
from django.http import Http404, HttpResponse
from django.middleware.csrf import get_token, CsrfViewMiddleware
from django.utils import timezone
from rest_framework.authentication import SessionAuthentication
from rest_framework.exceptions import APIException, MethodNotAllowed
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from payments.models import Booking, Receipt, Court
from payments import services
from . import auth, data, domain as d
from .models import BookingRecord, Proof, Invitation, Cancellation


class ContractAPIView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method in {"POST", "PATCH"} and not isinstance(request.data, dict):
            d.fail("The request must contain an object with named fields.")

    def handle_exception(self, exc):
        if isinstance(exc, d.ApiError):
            code, message, status = exc.code, exc.message, exc.status
        elif isinstance(exc, ValidationError):
            code, message, status = "INVALID_FIELDS", " ".join(exc.messages), 422
        elif isinstance(exc, (Http404, ObjectDoesNotExist)):
            code, message, status = "NOT_FOUND", "Record not found.", 404
        elif isinstance(exc, PermissionDenied):
            code, message, status = "FORBIDDEN", "You do not have permission for this action.", 403
        elif isinstance(exc, IntegrityError):
            code, message, status = "CONFLICT", "This record changed. Refresh before trying again.", 409
        elif isinstance(exc, APIException):
            detail = exc.detail
            code, status = "INVALID_FIELDS" if exc.status_code == 400 else "HTTP_" + str(exc.status_code), exc.status_code
            message = str(detail) if not isinstance(detail, (dict, list)) else "Check the highlighted fields."
            return Response({"error": {"code": code, "message": message, "fieldErrors": detail if isinstance(detail, dict) else {}}}, status=status)
        elif isinstance(exc, (ValueError, TypeError)):
            code, message, status = "INVALID_FIELDS", "Check the supplied identifiers and values.", 422
        else:
            return super().handle_exception(exc)
        return Response({"error": {"code": code, "message": message}}, status=status)

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response


def private_image(content):
    response = HttpResponse(bytes(content), content_type="image/png")
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


class AuthAPIView(ContractAPIView):
    def get(self, request, operation):
        if operation != "csrf":
            raise MethodNotAllowed(request.method)
        return Response({"csrfToken": get_token(request._request)})

    def post(self, request, operation):
        # SessionAuthentication alone does not check CSRF for anonymous logins.
        rejection = CsrfViewMiddleware(lambda req: HttpResponse()).process_view(request._request, lambda req: None, (), {})
        if rejection:
            d.fail("The security token expired. Refresh and try again.", "CSRF_FAILED", 403)
        if operation == "login":
            # Failed credentials must not roll back the stored attempt counter.
            return Response(auth.sign_in(request._request, request.data))
        if operation == "join":
            with transaction.atomic():
                return Response(auth.accept(request.data))
        if operation == "logout":
            logout(request._request)
            return Response({"message": "Signed out."})
        raise MethodNotAllowed(request.method)


class GuestAPIView(ContractAPIView):
    # A random X-Guest-Recovery credential, never a cookie or supplied email,
    # grants access only to its associated holds/bookings.
    authentication_classes = []

    def get(self, request, operation, identifier=None):
        if operation not in {"availability", "open-play", "holds", "bookings", "by-key", "payments", "qr"} or (operation not in {"availability", "open-play"} and identifier is None):
            raise MethodNotAllowed(request.method)
        credential = request.headers.get("X-Guest-Recovery")
        if operation in {"availability", "open-play"}:
            return Response(d.availability(request.query_params.dict(), "court" if operation == "availability" else "open-play", credential))
        if operation == "holds":
            return Response(d.hold_action("get", identifier, {}, credential))
        if operation == "bookings":
            return Response(d.receipt(identifier, credential))
        record = BookingRecord.objects.select_related("booking", "hold").filter(owner=d.owner(credential))
        record = record.filter(payment_key=identifier).first() if operation == "by-key" else record.filter(payment_id=identifier).first()
        if not record:
            raise Http404
        services.expire_bookings()
        record.booking.refresh_from_db()
        if operation == "qr":
            return private_image(record.booking.qr_data)
        return Response(d.payment_data(record))

    def post(self, request, operation, identifier=None):
        if operation not in {"holds", "payments", "cancellations", "proof"} or (operation in {"holds", "payments"} and identifier is not None):
            raise MethodNotAllowed(request.method)
        credential, key = request.headers.get("X-Guest-Recovery"), request.headers.get("Idempotency-Key")
        with transaction.atomic():
            d.lock_courts()
            services.expire_bookings()
            if operation == "holds":
                return Response(d.hold_action("create", None, request.data, credential, key), status=201)
            if operation == "payments":
                return Response(d.make_payment(request.data, credential, key), status=201)
            if operation == "cancellations":
                return Response(data.cancellation_request(identifier, request.data.get("reason"), credential))
            if operation == "proof":
                record = BookingRecord.objects.select_related("booking").filter(payment_id=identifier, owner=d.owner(credential)).first()
                if not record:
                    raise Http404
                return Response(data.upload(record, request.FILES.get("proof"), reference=request.data.get("reference")))
        raise MethodNotAllowed(request.method)

    def patch(self, request, operation, identifier=None):
        if operation != "holds" or not identifier:
            raise MethodNotAllowed(request.method)
        with transaction.atomic():
            d.lock_courts()
            return Response(d.hold_action("update", identifier, request.data, request.headers.get("X-Guest-Recovery"), request.headers.get("Idempotency-Key")))

    def delete(self, request, operation, identifier=None):
        if operation != "holds" or not identifier:
            raise MethodNotAllowed(request.method)
        with transaction.atomic():
            d.lock_courts()
            return Response(d.hold_action("release", identifier, {}, request.headers.get("X-Guest-Recovery")))


class StaffAPIView(ContractAPIView):
    def get(self, request, operation, identifier=None):
        actor = auth.require_staff(request._request, admin=operation in {"accounts", "invitations"})
        services.expire_bookings()
        filters = request.query_params.dict()
        if operation == "me": return Response(auth.actor_data(actor))
        if operation == "verify": return Response(d.verify_ticket(identifier))
        if operation == "bookings": result = data.details(identifier) if identifier else data.bookings(filters)
        elif operation == "customers": result = data.customer_data(identifier) if identifier else data.customers(filters.get("q", ""))
        elif operation == "schedules": result = data.schedule_data(d.find_session(identifier)) if identifier and d.find_session(identifier) else None if identifier else data.schedules()
        elif operation == "sessions": result = data.session_list(filters)
        elif operation == "cancellations": result = [data.cancellation_data(c) for c in Cancellation.objects.select_related("booking").order_by("-requested")[:100]]
        elif operation == "courts": result = [{"id": d.court_id(c), "name": c.name, "sport": c.sport, "active": True} for c in Court.objects.filter(active=True)]
        elif operation == "accounts": result = [auth.actor_data(u) for u in get_user_model().objects.filter(is_staff=True).order_by("email")]
        elif operation == "invitations": result = list(Invitation.objects.filter(expires__gt=timezone.now()).values("email", "role"))
        elif operation == "proofs":
            if identifier.startswith("receipt:"):
                return private_image(Receipt.objects.get(booking_id=identifier[8:]).image)
            proof = Proof.objects.get(pk=identifier)
            if proof.mime == "image/png":
                return private_image(proof.content)
            # Keep imported legacy documents downloadable without rendering them
            # as trusted images or allowing new PDF/WebP uploads.
            response = HttpResponse(bytes(proof.content), content_type="application/octet-stream")
            response["Content-Disposition"] = 'attachment; filename="legacy-payment-proof"'
            response["Content-Security-Policy"] = "default-src 'none'; sandbox"
            return response
        else: raise Http404
        if result is None: raise Http404
        return Response(result)

    def post(self, request, operation, identifier=None):
        actor = auth.require_staff(request._request, admin=operation in {"invitations", "revoke", "accounts"}, permission="payments.change_booking")
        fields = request.data
        with transaction.atomic():
            d.lock_courts()
            services.expire_bookings()
            if operation == "invitations":
                secret = auth.invite(fields.get("email"), fields.get("role"))
                result = {"message": "Invitation created.", "invitation": settings.FRONTEND_ORIGIN + "/join#" + secret, "invitationEmail": d.email(fields.get("email"))}
            elif operation == "revoke":
                Invitation.objects.filter(email=d.email(fields.get("email"))).delete()
                result = {"message": "Invitation revoked."}
            elif operation == "accounts": result = auth.update_account(actor, fields)
            elif operation == "schedules": result = data.save_schedule(fields)
            elif operation == "schedule-change": result = data.change_schedule(fields)
            elif operation == "walk-ins":
                payment = d.walk_in(fields, actor, request.headers.get("Idempotency-Key"))
                result = {"message": "Walk-in booking saved.", "bookingId": payment["reservationId"]}
            elif operation == "upload":
                record = BookingRecord.objects.select_related("booking").filter(payment_id=identifier).first()
                if not record:
                    record = data.meta(Booking.objects.get(pk=identifier))
                result = data.upload(record, request.FILES.get("proof"), actor, fields.get("reference"))
            elif operation == "review":
                if fields.get("checked") not in (True, "on", "true", "1"):
                    d.fail("Confirm that you checked the actual transfer before reviewing.")
                result = data.review_proof(identifier, fields.get("outcome"), fields.get("reason"), fields.get("bank_reference"), actor)
            elif operation == "cancellation": result = data.cancellation_request(identifier, fields.get("reason"), actor=actor)
            elif operation == "cancel": result = data.complete_cancel(identifier, fields.get("refund"), fields.get("decision"), actor)
            elif operation == "refund": result = data.record_refund(identifier, fields.get("decision"), actor)
            elif operation == "cash": result = data.cash_received(identifier, actor)
            else: raise Http404
            return Response(result)
