from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from .images import clean_image
from .models import Booking, Court, PlaySession, Receipt


class StrictInputSerializer(serializers.Serializer):
    """Reject unexpected input instead of accepting client-controlled payment state."""

    def to_internal_value(self, data):
        if hasattr(data, "keys"):
            unexpected = set(data.keys()) - set(self.fields)
            if unexpected:
                raise serializers.ValidationError({key: "Unexpected field." for key in sorted(unexpected)})
        return super().to_internal_value(data)


class ReservationSerializer(StrictInputSerializer):
    court_id = serializers.IntegerField(min_value=1)
    request_key = serializers.UUIDField()
    session_id = serializers.IntegerField(min_value=1, required=False, allow_null=True, default=None)
    date = serializers.DateField(required=False, allow_null=True, default=None)
    start_hour = serializers.IntegerField(min_value=8, max_value=23, required=False, allow_null=True, default=None)
    hours = serializers.IntegerField(min_value=1, max_value=16, required=False, allow_null=True, default=None)

    def validate(self, data):
        if data["session_id"] is None:
            missing = {name: "Required for court rental." for name in ["date", "start_hour", "hours"] if data[name] is None}
            if missing:
                raise serializers.ValidationError(missing)
            if data["start_hour"] + data["hours"] > 24:
                raise serializers.ValidationError({"hours": "Booking must end by midnight."})
        if data["date"] is not None:
            data["date"] = data["date"].isoformat()
        return data


class ReceiptUploadSerializer(StrictInputSerializer):
    proof = serializers.FileField(write_only=True)
    reference = serializers.CharField(max_length=120, trim_whitespace=True)

    def validate_proof(self, upload):
        try:
            return clean_image(upload)
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.messages) from None


class PaymentReviewSerializer(StrictInputSerializer):
    decision = serializers.ChoiceField(choices=["confirm", "reject"])
    note = serializers.CharField(max_length=2000, trim_whitespace=True)
    bank_reference = serializers.CharField(max_length=120, required=False, allow_blank=True, default="", trim_whitespace=True)
    checked = serializers.BooleanField()

    def validate(self, data):
        if not data["checked"]:
            raise serializers.ValidationError({"checked": "Check the actual owner account and transfer before reviewing."})
        if data["decision"] == "confirm" and not data["bank_reference"]:
            raise serializers.ValidationError({"bank_reference": "Enter the reference verified in the owner's account."})
        return data


class BookingSerializer(serializers.ModelSerializer):
    currency = serializers.SerializerMethodField()
    court_name = serializers.CharField(source="court.name", read_only=True)
    receipt_submitted = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = ["id", "court_id", "court_name", "play_session_id", "starts_at", "ends_at", "amount", "currency",
            "status", "expires_at", "created_at", "destination_label", "payee", "account", "bank_reference", "receipt_submitted"]
        read_only_fields = fields

    def get_currency(self, obj):
        return "PHP"

    def get_receipt_submitted(self, obj):
        return Receipt.objects.filter(booking=obj).exists()


class StaffBookingSerializer(BookingSerializer):
    class Meta(BookingSerializer.Meta):
        fields = BookingSerializer.Meta.fields + ["customer_email"]
        read_only_fields = fields


class CourtSerializer(serializers.ModelSerializer):
    class Meta:
        model = Court
        fields = ["id", "name", "sport", "hourly_amount"]
        read_only_fields = fields


class PlaySessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlaySession
        fields = ["id", "court_id", "name", "starts_at", "ends_at", "capacity", "amount"]
        read_only_fields = fields
